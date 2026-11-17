from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
import time
from typing import List, Optional
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, Depends, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db, init_db, SessionLocal
from app.models import (
    Employee,
    Balance,
    LeaveRequest,
    Disability,
    ChatConversation,
    ChatLog,
    DailyReport,
    DriveDocument,
    DocumentChunk,
    DocumentAuditAlert,
    Ticket,
    TicketHistory,
)
from app.schemas import (
    LoginRequest,
    LoginResponse,
    UserSession,
    ChatRequest,
    ChatResponse,
    ChatFeedbackRequest,
    ConversationOut,
    MyDataResponse,
    BalanceOut,
    LeaveRequestOut,
    LeaveRequestCreate,
    LeaveRequestDecision,
    DisabilityOut,
    TicketCreateRequest,
    TicketUpdateRequest,
    TicketOut,
    TicketHistoryOut,
    DocumentOut,
    DocumentAlertOut,
    DocumentsStatusResponse,
    DashboardReportResponse,
    SystemStatusResponse,
    Citation,
)
from app.auth import verify_password, create_access_token, get_current_user, require_hr_role
from app.agents.orchestrator import process_chat_query
from app.agents.analyst_agent import generate_daily_report
from app.agents.ingestion_agent import sync_drive_policies
from app.agents.escalation_agent import create_ticket
from app.agents.payment_schedule import get_next_payment_info
from app.seed import seed_database

scheduler = BackgroundScheduler(timezone=ZoneInfo(settings.TIMEZONE))

# Limitadores simples en memoria (en producción usar Redis)
_LOGIN_ATTEMPTS: dict[str, list[float]] = defaultdict(list)
_CHAT_ATTEMPTS: dict[int, list[float]] = defaultdict(list)


def _check_rate_limit(bucket: dict, key, max_calls: int, window_seconds: int, detail: str):
    now = time.time()
    bucket[key] = [t for t in bucket[key] if now - t < window_seconds]
    if len(bucket[key]) >= max_calls:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail)
    bucket[key].append(now)


def _scheduled_ingestion_job():
    db = SessionLocal()
    try:
        sync_drive_policies(db)
    finally:
        db.close()


def _scheduled_analyst_job():
    db = SessionLocal()
    try:
        generate_daily_report(db)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()

    scheduler.add_job(
        _scheduled_ingestion_job,
        CronTrigger(hour=settings.INGESTION_CRON_HOUR, minute=settings.INGESTION_CRON_MINUTE),
        id="daily_drive_ingestion",
        replace_existing=True,
    )
    scheduler.add_job(
        _scheduled_analyst_job,
        CronTrigger(hour=settings.ANALYST_CRON_HOUR, minute=settings.ANALYST_CRON_MINUTE),
        id="daily_analyst_report",
        replace_existing=True,
    )
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="Portal de RRHH — Nubera Digital",
    description="API OpenAPI de consultas internas con LangGraph, agentes de políticas/datos, tickets y dashboard privado de RRHH.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _to_user_session(emp: Employee) -> UserSession:
    return UserSession(
        id=emp.id,
        employee_code=emp.employee_code,
        email=emp.email,
        full_name=emp.full_name,
        role=emp.role,
        department=emp.department,
        position=emp.position,
        hire_date=emp.hire_date,
        next_payment_date=emp.next_payment_date,
        next_review_date=emp.next_review_date,
    )


def _to_ticket_out(t: Ticket) -> TicketOut:
    return TicketOut(
        id=t.id,
        folio=t.folio,
        employee_name=t.employee.full_name if t.employee else "Colaborador",
        department=t.employee.department if t.employee else "N/A",
        topic=t.topic,
        confirmed_summary=t.confirmed_summary,
        status=t.status,
        assigned_to=t.assigned_to,
        is_sensitive=t.is_sensitive,
        created_at=t.created_at,
        updated_at=t.updated_at,
        history=[
            TicketHistoryOut(
                id=h.id,
                actor_name=h.actor_name,
                action=h.action,
                notes=h.notes,
                created_at=h.created_at,
            )
            for h in sorted(t.history, key=lambda x: x.created_at)
        ],
    )


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "nubera-rrhh-backend", "version": "2.0.0"}


@app.get("/api/system/status", response_model=SystemStatusResponse)
def system_status(db: Session = Depends(get_db)):
    policies_count = db.query(DriveDocument).filter(DriveDocument.status == "activo").count()
    chunks_count = db.query(DocumentChunk).count()
    db_mode = (
        "PostgreSQL + pgvector"
        if settings.is_postgres
        else ("MySQL + búsqueda vectorial" if settings.is_mysql else "SQLite local (modo demostración)")
    )
    return SystemStatusResponse(
        environment=settings.APP_ENV,
        database_mode=db_mode,
        drive_mode="Google Drive API" if settings.GOOGLE_DRIVE_ENABLED else "Catálogo de políticas local (modo demostración)",
        llm_mode=settings.LLM_PROVIDER if settings.LLM_PROVIDER != "none" else "LangGraph + Embeddings locales",
        timezone=settings.TIMEZONE,
        demo_mode=not (settings.is_postgres and settings.GOOGLE_DRIVE_ENABLED),
        active_policies_count=policies_count,
        active_chunks_count=chunks_count,
    )


@app.post("/api/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    email_norm = payload.email.strip().lower()
    _check_rate_limit(
        _LOGIN_ATTEMPTS,
        f"{client_ip}:{email_norm}",
        max_calls=15,
        window_seconds=300,
        detail="Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.",
    )

    employee = db.query(Employee).filter(Employee.email == email_norm, Employee.status == "activo").first()
    if not employee or not verify_password(payload.password, employee.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos.",
        )

    token = create_access_token(employee)
    redirect_to = "/dashboard" if employee.role == "rrhh" else "/consultas"
    return LoginResponse(
        access_token=token,
        redirect_to=redirect_to,
        user=_to_user_session(employee),
    )


@app.get("/api/auth/me", response_model=UserSession)
def get_me(current_user: Employee = Depends(get_current_user)):
    return _to_user_session(current_user)


@app.get("/api/me/data", response_model=MyDataResponse)
def get_my_data(current_user: Employee = Depends(get_current_user), db: Session = Depends(get_db)):
    pay_info = get_next_payment_info(db)
    user_out = _to_user_session(current_user)
    user_out.next_payment_date = pay_info["projected_date"]
    balances = (
        db.query(Balance)
        .filter(Balance.employee_id == current_user.id)
        .order_by(Balance.year.desc())
        .all()
    )
    requests = (
        db.query(LeaveRequest)
        .filter(LeaveRequest.employee_id == current_user.id)
        .order_by(LeaveRequest.created_at.desc())
        .limit(15)
        .all()
    )
    disabilities = (
        db.query(Disability)
        .filter(Disability.employee_id == current_user.id)
        .order_by(Disability.start_date.desc())
        .limit(10)
        .all()
    )
    return MyDataResponse(
        employee=user_out,
        balances=[
            BalanceOut(
                year=b.year,
                entitled_days=float(b.entitled_days),
                used_days=float(b.used_days),
                pending_days=float(b.pending_days),
                available_days=float(b.available_days),
                expiration_date=b.expiration_date,
            )
            for b in balances
        ],
        recent_requests=[
            LeaveRequestOut(
                id=r.id,
                employee_name=current_user.full_name,
                department=current_user.department,
                request_type=r.request_type,
                start_date=r.start_date,
                end_date=r.end_date,
                days_count=float(r.days_count),
                status=r.status,
                reason=r.reason,
                approver_notes=r.approver_notes,
                created_at=r.created_at,
            )
            for r in requests
        ],
        disabilities=[
            DisabilityOut(
                id=d.id,
                folio_imss=d.folio_imss,
                disability_type=d.disability_type,
                start_date=d.start_date,
                end_date=d.end_date,
                days_count=d.days_count,
                status=d.status,
            )
            for d in disabilities
        ],
        updated_at=datetime.now(timezone.utc),
    )


@app.get("/api/chat/conversations", response_model=List[ConversationOut])
def list_conversations(current_user: Employee = Depends(get_current_user), db: Session = Depends(get_db)):
    convs = (
        db.query(ChatConversation)
        .filter(ChatConversation.employee_id == current_user.id)
        .order_by(ChatConversation.updated_at.desc())
        .limit(20)
        .all()
    )
    return [ConversationOut(id=c.id, title=c.title, updated_at=c.updated_at) for c in convs]


@app.post("/api/chat", response_model=ChatResponse)
def chat_query(
    payload: ChatRequest,
    response: Response,
    current_user: Employee = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_rate_limit(
        _CHAT_ATTEMPTS,
        current_user.id,
        max_calls=60,
        window_seconds=60,
        detail="Has alcanzado el límite temporal de consultas por minuto. Espera un momento.",
    )

    log, suggested_summary = process_chat_query(
        db=db,
        current_user=current_user,
        question=payload.question.strip(),
        session_id=payload.session_id or "default",
    )
    response.headers["X-Trace-Id"] = log.trace_id
    citations = [Citation(**c) for c in (log.citations_json or [])]
    return ChatResponse(
        id=log.id,
        trace_id=log.trace_id,
        session_id=log.session_id,
        question=log.question,
        answer=log.answer,
        intent=log.intent,
        agent_used=log.agent_used,
        prompt_version=log.prompt_version,
        topic=log.topic,
        citations=citations,
        latency_ms=log.latency_ms,
        outcome=log.outcome,
        needs_hr_escalation=(log.outcome == "escalada_rrhh"),
        suggested_ticket_summary=suggested_summary,
        helpful=log.helpful,
        created_at=log.created_at,
    )


@app.get("/api/chat/history", response_model=List[ChatResponse])
def chat_history(
    session_id: Optional[str] = Query(default=None),
    limit: int = Query(default=40, ge=1, le=100),
    current_user: Employee = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(ChatLog).filter(ChatLog.employee_id == current_user.id)
    if session_id:
        q = q.filter(ChatLog.session_id == session_id)
    logs = q.order_by(ChatLog.created_at.asc(), ChatLog.id.asc()).limit(limit).all()
    return [
        ChatResponse(
            id=log.id,
            trace_id=log.trace_id,
            session_id=log.session_id,
            question=log.question,
            answer=log.answer,
            intent=log.intent,
            agent_used=log.agent_used,
            prompt_version=log.prompt_version,
            topic=log.topic,
            citations=[Citation(**c) for c in (log.citations_json or [])],
            latency_ms=log.latency_ms,
            outcome=log.outcome,
            needs_hr_escalation=(log.outcome == "escalada_rrhh"),
            helpful=log.helpful,
            created_at=log.created_at,
        )
        for log in logs
    ]


@app.post("/api/chat/{log_id}/feedback")
def chat_feedback(
    log_id: int,
    payload: ChatFeedbackRequest,
    current_user: Employee = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.query(ChatLog).filter(ChatLog.id == log_id, ChatLog.employee_id == current_user.id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Consulta no encontrada.")
    log.helpful = payload.helpful
    db.commit()
    return {"status": "ok", "id": log.id, "helpful": log.helpful}


# --- Tickets ---

@app.post("/api/tickets", response_model=TicketOut)
def create_user_ticket(
    payload: TicketCreateRequest,
    current_user: Employee = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = create_ticket(
        db=db,
        employee=current_user,
        topic=payload.topic,
        confirmed_summary=payload.confirmed_summary,
        is_sensitive=payload.is_sensitive,
    )
    return _to_ticket_out(ticket)


@app.get("/api/tickets/mine", response_model=List[TicketOut])
def list_my_tickets(current_user: Employee = Depends(get_current_user), db: Session = Depends(get_db)):
    tickets = (
        db.query(Ticket)
        .filter(Ticket.employee_id == current_user.id)
        .order_by(Ticket.created_at.desc())
        .all()
    )
    return [_to_ticket_out(t) for t in tickets]


@app.get("/api/tickets", response_model=List[TicketOut])
def list_all_tickets(hr_user: Employee = Depends(require_hr_role), db: Session = Depends(get_db)):
    tickets = db.query(Ticket).order_by(Ticket.created_at.desc()).all()
    # Casos sensibles visibles solo para Dirección / especialista asignado
    visible = [
        t for t in tickets
        if (not t.is_sensitive) or hr_user.full_name == t.assigned_to or "Directora" in hr_user.position
    ]
    return [_to_ticket_out(t) for t in visible]


@app.patch("/api/tickets/{ticket_id}", response_model=TicketOut)
def update_ticket(
    ticket_id: int,
    payload: TicketUpdateRequest,
    hr_user: Employee = Depends(require_hr_role),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado.")
    ticket.status = payload.status
    if payload.assigned_to:
        ticket.assigned_to = payload.assigned_to
    ticket.updated_at = datetime.now(timezone.utc)
    db.add(
        TicketHistory(
            ticket_id=ticket.id,
            actor_name=hr_user.full_name,
            action=f"Actualización a {payload.status}",
            notes=payload.notes,
        )
    )
    db.commit()
    db.refresh(ticket)
    return _to_ticket_out(ticket)


# --- Solicitudes (Colaborador y RRHH) ---

def _count_business_days(start_d: date, end_d: date) -> int:
    from datetime import timedelta
    days = 0
    cur = start_d
    while cur <= end_d:
        if cur.weekday() < 5:
            days += 1
        cur += timedelta(days=1)
    return days


@app.post("/api/requests", response_model=LeaveRequestOut)
def create_leave_request(
    payload: LeaveRequestCreate,
    current_user: Employee = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from datetime import timedelta
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="La fecha de fin debe ser posterior o igual a la fecha de inicio.")

    today = datetime.now(ZoneInfo(settings.TIMEZONE)).date()
    days_count = _count_business_days(payload.start_date, payload.end_date)
    if days_count <= 0:
        raise HTTPException(status_code=400, detail="El periodo seleccionado debe incluir al menos un día hábil.")

    if payload.request_type == "vacaciones":
        lead_business_days = _count_business_days(today + timedelta(days=1), payload.start_date)
        if lead_business_days < 10:
            raise HTTPException(
                status_code=400,
                detail="Conforme a RH-01, las vacaciones deben solicitarse con al menos 10 días hábiles de anticipación.",
            )
        bal = db.query(Balance).filter(Balance.employee_id == current_user.id).order_by(Balance.year.desc()).first()
        if not bal or float(bal.available_days) < days_count:
            raise HTTPException(
                status_code=400,
                detail="No cuentas con suficientes días disponibles en tu saldo vacacional.",
            )
        bal.pending_days = float(bal.pending_days) + days_count
        bal.available_days = float(bal.available_days) - days_count

    lr = LeaveRequest(
        employee_id=current_user.id,
        request_type=payload.request_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_count=days_count,
        status="pendiente",
        reason=payload.reason,
    )
    db.add(lr)
    db.commit()
    db.refresh(lr)
    return LeaveRequestOut(
        id=lr.id,
        employee_name=current_user.full_name,
        department=current_user.department,
        request_type=lr.request_type,
        start_date=lr.start_date,
        end_date=lr.end_date,
        days_count=float(lr.days_count),
        status=lr.status,
        reason=lr.reason,
        approver_notes=lr.approver_notes,
        created_at=lr.created_at,
    )


@app.get("/api/requests", response_model=List[LeaveRequestOut])
def list_all_requests(
    status_filter: Optional[str] = Query(default=None),
    department: Optional[str] = Query(default=None),
    _: Employee = Depends(require_hr_role),
    db: Session = Depends(get_db),
):
    q = db.query(LeaveRequest, Employee).join(Employee, Employee.id == LeaveRequest.employee_id)
    if status_filter:
        q = q.filter(LeaveRequest.status == status_filter)
    if department:
        q = q.filter(Employee.department == department)
    rows = q.order_by(LeaveRequest.created_at.desc()).limit(60).all()
    return [
        LeaveRequestOut(
            id=lr.id,
            employee_name=emp.full_name,
            department=emp.department,
            request_type=lr.request_type,
            start_date=lr.start_date,
            end_date=lr.end_date,
            days_count=float(lr.days_count),
            status=lr.status,
            reason=lr.reason,
            approver_notes=lr.approver_notes,
            created_at=lr.created_at,
        )
        for lr, emp in rows
    ]


@app.patch("/api/requests/{request_id}", response_model=LeaveRequestOut)
def decide_request(
    request_id: int,
    payload: LeaveRequestDecision,
    _: Employee = Depends(require_hr_role),
    db: Session = Depends(get_db),
):
    lr = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not lr:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    lr.status = payload.status
    lr.approver_notes = payload.approver_notes
    lr.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(lr)
    emp = db.query(Employee).filter(Employee.id == lr.employee_id).first()
    return LeaveRequestOut(
        id=lr.id,
        employee_name=emp.full_name if emp else "",
        department=emp.department if emp else "",
        request_type=lr.request_type,
        start_date=lr.start_date,
        end_date=lr.end_date,
        days_count=float(lr.days_count),
        status=lr.status,
        reason=lr.reason,
        approver_notes=lr.approver_notes,
        created_at=lr.created_at,
    )


# --- Dashboard y Reportes ---

@app.get("/api/dashboard/dates", response_model=List[date])
def list_report_dates(
    _: Employee = Depends(require_hr_role),
    db: Session = Depends(get_db),
):
    rows = db.query(DailyReport.report_date).order_by(DailyReport.report_date.desc()).all()
    return [r[0] for r in rows]


@app.get("/api/dashboard/report", response_model=DashboardReportResponse)
def get_dashboard_report(
    report_date: Optional[date] = Query(default=None),
    _: Employee = Depends(require_hr_role),
    db: Session = Depends(get_db),
):
    query = db.query(DailyReport)
    if report_date is not None:
        report = query.filter(DailyReport.report_date == report_date).first()
    else:
        report = query.order_by(DailyReport.report_date.desc()).first()

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No existe un reporte guardado para la fecha seleccionada.",
        )

    return DashboardReportResponse(
        report_date=report.report_date,
        absences_today=report.absences_today,
        pending_requests=report.pending_requests,
        pending_over_3_days=report.pending_over_3_days,
        active_disabilities=report.active_disabilities,
        resolved_without_escalation_pct=float(report.resolved_without_escalation_pct),
        monthly_disability_days=report.monthly_disability_days,
        monthly_hires=report.monthly_hires,
        monthly_exits=report.monthly_exits,
        turnover_rate_pct=float(report.turnover_rate_pct),
        employees_over_20_vacation_days=report.employees_over_20_vacation_days,
        prev_day_chat_volume=report.prev_day_chat_volume,
        prev_day_avg_latency_ms=report.prev_day_avg_latency_ms,
        executive_summary=report.executive_summary,
        payload_json=report.payload_json,
        generated_at=report.generated_at,
    )


@app.post("/api/dashboard/report/generate", response_model=DashboardReportResponse)
def trigger_report_generation(
    report_date: Optional[date] = Query(default=None),
    _: Employee = Depends(require_hr_role),
    db: Session = Depends(get_db),
):
    report = generate_daily_report(db, report_date)
    return DashboardReportResponse(
        report_date=report.report_date,
        absences_today=report.absences_today,
        pending_requests=report.pending_requests,
        pending_over_3_days=report.pending_over_3_days,
        active_disabilities=report.active_disabilities,
        resolved_without_escalation_pct=float(report.resolved_without_escalation_pct),
        monthly_disability_days=report.monthly_disability_days,
        monthly_hires=report.monthly_hires,
        monthly_exits=report.monthly_exits,
        turnover_rate_pct=float(report.turnover_rate_pct),
        employees_over_20_vacation_days=report.employees_over_20_vacation_days,
        prev_day_chat_volume=report.prev_day_chat_volume,
        prev_day_avg_latency_ms=report.prev_day_avg_latency_ms,
        executive_summary=report.executive_summary,
        payload_json=report.payload_json,
        generated_at=report.generated_at,
    )


# --- Documentos y Sincronización ---

@app.get("/api/documents", response_model=DocumentsStatusResponse)
def list_documents(
    _: Employee = Depends(require_hr_role),
    db: Session = Depends(get_db),
):
    docs = db.query(DriveDocument).order_by(DriveDocument.policy_code.asc()).all()
    alerts = db.query(DocumentAuditAlert).order_by(DocumentAuditAlert.created_at.desc()).limit(30).all()
    last_sync = max((d.last_synced_at for d in docs), default=None)
    total_chunks = db.query(DocumentChunk).count()

    doc_outs = []
    for d in docs:
        c_count = db.query(DocumentChunk).filter(DocumentChunk.document_id == d.id).count()
        doc_outs.append(
            DocumentOut(
                id=d.id,
                drive_file_id=d.drive_file_id,
                policy_code=d.policy_code,
                title=d.title,
                mime_type=d.mime_type,
                version=d.version,
                effective_date=d.effective_date,
                owner=d.owner,
                drive_url=d.drive_url,
                status=d.status,
                chunks_count=c_count,
                last_synced_at=d.last_synced_at,
            )
        )

    return DocumentsStatusResponse(
        last_synced_at=last_sync,
        total_active_documents=sum(1 for d in docs if d.status == "activo"),
        total_chunks=total_chunks,
        documents=doc_outs,
        alerts=[
            DocumentAlertOut(
                id=a.id,
                drive_file_id=a.drive_file_id,
                title=a.title,
                alert_type=a.alert_type,
                severity=a.severity,
                detail=a.detail,
                resolved=a.resolved,
                created_at=a.created_at,
            )
            for a in alerts
        ],
    )


@app.get("/api/documents/{drive_file_id}/content")
def get_document_content(
    drive_file_id: str,
    _: Employee = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = db.query(DriveDocument).filter(DriveDocument.drive_file_id == drive_file_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")
    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == doc.id)
        .order_by(DocumentChunk.chunk_index.asc())
        .all()
    )
    return {
        "drive_file_id": doc.drive_file_id,
        "policy_code": doc.policy_code,
        "title": doc.title,
        "mime_type": doc.mime_type,
        "version": doc.version,
        "effective_date": doc.effective_date,
        "owner": doc.owner,
        "drive_url": doc.drive_url,
        "status": doc.status,
        "last_synced_at": doc.last_synced_at,
        "sections": [{"section": c.section, "content": c.content} for c in chunks],
    }


@app.get("/api/ingestion/oauth/url")
def get_google_oauth_url(_: Employee = Depends(require_hr_role)):
    import json
    from pathlib import Path
    from urllib.parse import urlencode

    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    if not client_id and Path(settings.GOOGLE_OAUTH_CLIENT_FILE).exists():
        raw = json.loads(Path(settings.GOOGLE_OAUTH_CLIENT_FILE).read_text(encoding="utf-8"))
        client_id = (raw.get("web") or raw.get("installed") or {}).get("client_id", "")

    if not client_id:
        raise HTTPException(status_code=400, detail="Configura GOOGLE_OAUTH_CLIENT_ID o client_secret.json en backend/.env")

    params = urlencode({
        "client_id": client_id,
        "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/drive.readonly",
        "access_type": "offline",
        "prompt": "consent",
    })
    return {"auth_url": f"https://accounts.google.com/o/oauth2/v2/auth?{params}"}


@app.get("/api/auth/google/callback")
def google_oauth_callback(code: str):
    import json
    from pathlib import Path
    import httpx

    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    client_secret = settings.GOOGLE_OAUTH_CLIENT_SECRET
    if (not client_id or not client_secret) and Path(settings.GOOGLE_OAUTH_CLIENT_FILE).exists():
        raw = json.loads(Path(settings.GOOGLE_OAUTH_CLIENT_FILE).read_text(encoding="utf-8"))
        cfg = raw.get("web") or raw.get("installed") or {}
        client_id = client_id or cfg.get("client_id", "")
        client_secret = client_secret or cfg.get("client_secret", "")

    resp = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=15.0,
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Error al intercambiar código OAuth: {resp.text}")

    token_data = resp.json()
    token_data["client_id"] = client_id
    token_data["client_secret"] = client_secret
    token_data["token_uri"] = "https://oauth2.googleapis.com/token"
    Path(settings.GOOGLE_OAUTH_TOKEN_FILE).write_text(json.dumps(token_data, indent=2), encoding="utf-8")
    return {"status": "ok", "message": "Google Drive autorizado correctamente. Ya puedes sincronizar documentos."}


@app.post("/api/ingestion/sync")
def trigger_drive_sync(
    _: Employee = Depends(require_hr_role),
    db: Session = Depends(get_db),
):
    stats = sync_drive_policies(db)
    return {"status": "ok", "sync_stats": stats}


@app.post("/api/documents/alerts/{alert_id}/resolve")
def resolve_document_alert(
    alert_id: int,
    _: Employee = Depends(require_hr_role),
    db: Session = Depends(get_db),
):
    alert = db.query(DocumentAuditAlert).filter(DocumentAuditAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alerta no encontrada.")
    alert.resolved = True
    db.commit()
    return {"status": "ok", "id": alert.id}
