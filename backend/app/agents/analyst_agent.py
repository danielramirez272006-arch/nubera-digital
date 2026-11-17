from datetime import date, datetime, timedelta, timezone
from typing import Dict, Any, List
from zoneinfo import ZoneInfo
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Employee, Balance, LeaveRequest, Movement, ChatLog, DailyReport
from app.agents.llm_client import generate_chat_completion


def _build_executive_summary(metrics: Dict[str, Any]) -> str:
    """
    Redacta un resumen ejecutivo de 3 a 5 frases en español de México
    a partir de las cifras calculadas del reporte diario.
    """
    r_date = metrics["report_date"]
    absences = metrics["absences_today"]
    pending = metrics["pending_requests"]
    over_3 = metrics["pending_over_3_days"]
    disabilities = metrics["active_disabilities"]
    resolved_pct = metrics["resolved_without_escalation_pct"]
    turnover = metrics["turnover_rate_pct"]
    over_20 = metrics["employees_over_20_vacation_days"]
    chat_vol = metrics["prev_day_chat_volume"]
    avg_lat = metrics["prev_day_avg_latency_ms"]

    s1 = (
        f"Al corte del {r_date}, Nubera Digital registra {absences} ausencia(s) activa(s) en el día "
        f"y {disabilities} incapacidad(es) médica(s) vigente(s)."
    )
    s2 = (
        f"Existen {pending} solicitud(es) pendiente(s) de atención, de las cuales {over_3} "
        f"llevan más de tres días sin respuesta y requieren seguimiento prioritario."
    )
    s3 = (
        f"En el asistente de consultas, ayer se atendieron {chat_vol} interacciones con una latencia "
        f"promedio de {avg_lat} ms y una tasa de resolución sin escalamiento del {resolved_pct:.1f}%."
    )
    s4 = (
        f"En indicadores de plantilla, la rotación mensual se ubica en {turnover:.1f}% y "
        f"{over_20} colaborador(es) acumulan más de 20 días de vacaciones disponibles."
    )
    deterministic = f"{s1} {s2} {s3} {s4}"
    llm_summary = generate_chat_completion(
        system_prompt=(
            "Eres el Agente Analista de RRHH de Nubera Digital. Redacta un resumen ejecutivo de 3 a 5 frases "
            "en español de México usando ÚNICAMENTE las cifras exactas del JSON proporcionado."
        ),
        user_prompt=f"Cifras del reporte: {metrics}",
        max_tokens=300,
    )
    return llm_summary or deterministic


def generate_daily_report(db: Session, target_date: date | None = None) -> DailyReport:
    """
    Agente analista: calcula todos los indicadores en SQL para `target_date`
    (por defecto hoy en America/Mexico_City) y guarda el reporte en `daily_reports`.
    """
    if target_date is None:
        tz = ZoneInfo(settings.TIMEZONE)
        target_date = datetime.now(tz).date()

    # 1. Ausencias del día (solicitudes aprobadas que cubren target_date)
    today_leaves = (
        db.query(LeaveRequest, Employee)
        .join(Employee, Employee.id == LeaveRequest.employee_id)
        .filter(
            LeaveRequest.status == "aprobada",
            LeaveRequest.start_date <= target_date,
            LeaveRequest.end_date >= target_date,
        )
        .all()
    )
    absences_today = len(today_leaves)
    active_disabilities = sum(1 for lr, _ in today_leaves if lr.request_type == "incapacidad")

    by_type_map: Dict[str, int] = {}
    by_dept_map: Dict[str, int] = {}
    for lr, emp in today_leaves:
        t_label = lr.request_type.replace("_", " ").capitalize()
        by_type_map[t_label] = by_type_map.get(t_label, 0) + 1
        by_dept_map[emp.department] = by_dept_map.get(emp.department, 0) + 1

    # 2. Solicitudes pendientes y >3 días
    pending_rows = (
        db.query(LeaveRequest, Employee)
        .join(Employee, Employee.id == LeaveRequest.employee_id)
        .filter(LeaveRequest.status == "pendiente")
        .order_by(LeaveRequest.created_at.asc())
        .all()
    )
    pending_list: List[Dict[str, Any]] = []
    pending_over_3 = 0
    for lr, emp in pending_rows:
        created_d = lr.created_at.date() if lr.created_at else target_date
        if created_d > target_date:
            continue
        days_waiting = (target_date - created_d).days
        is_over_3 = days_waiting > 3
        if is_over_3:
            pending_over_3 += 1
        pending_list.append(
            {
                "id": lr.id,
                "employee_name": emp.full_name,
                "department": emp.department,
                "request_type": lr.request_type.replace("_", " ").capitalize(),
                "start_date": lr.start_date.isoformat(),
                "end_date": lr.end_date.isoformat(),
                "days_count": float(lr.days_count),
                "days_waiting": days_waiting,
                "is_over_3_days": is_over_3,
            }
        )
    pending_requests = len(pending_list)

    # 3. Serie de ausencias últimos 30 días
    start_30 = target_date - timedelta(days=29)
    approved_30 = (
        db.query(LeaveRequest)
        .filter(
            LeaveRequest.status == "aprobada",
            LeaveRequest.end_date >= start_30,
            LeaveRequest.start_date <= target_date,
        )
        .all()
    )
    absences_last_30_days = []
    for offset in range(30):
        d = start_30 + timedelta(days=offset)
        cnt = sum(1 for lr in approved_30 if lr.start_date <= d <= lr.end_date)
        absences_last_30_days.append({"date": d.isoformat(), "label": d.strftime("%d/%m"), "absences": cnt})

    # 4. Chat logs (global hasta target_date y día anterior)
    end_dt = datetime.combine(target_date, datetime.max.time()).replace(tzinfo=timezone.utc)
    all_chats = db.query(ChatLog).filter(ChatLog.created_at <= end_dt).all()
    total_chats = len(all_chats)
    resolved_chats = sum(1 for c in all_chats if c.outcome == "resuelta")
    resolved_pct = round((resolved_chats / total_chats) * 100.0, 2) if total_chats > 0 else 100.0

    topic_counts: Dict[str, int] = {}
    for c in all_chats:
        topic_counts[c.topic] = topic_counts.get(c.topic, 0) + 1
    top_5_topics = [
        {"topic": k, "count": v}
        for k, v in sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    ]

    prev_day = target_date - timedelta(days=1)
    prev_chats = [c for c in all_chats if c.created_at and c.created_at.date() == prev_day]
    prev_day_chat_volume = len(prev_chats)
    prev_day_avg_latency_ms = (
        int(sum(c.latency_ms for c in prev_chats) / len(prev_chats)) if prev_chats else 0
    )

    unanswered_questions = [
        {
            "question": c.question,
            "topic": c.topic,
            "created_at": c.created_at.isoformat() if c.created_at else target_date.isoformat(),
        }
        for c in reversed(all_chats)
        if c.outcome == "escalada_rrhh"
    ][:10]

    # 5. Indicadores mensuales y de plantilla
    month_start = target_date.replace(day=1)
    monthly_disability_days = sum(
        int(lr.days_count)
        for lr in approved_30
        if lr.request_type == "incapacidad" and lr.start_date >= month_start and lr.start_date <= target_date
    )

    monthly_hires = (
        db.query(Employee)
        .filter(Employee.hire_date >= month_start, Employee.hire_date <= target_date)
        .count()
    )
    monthly_exits = (
        db.query(Employee)
        .filter(
            Employee.termination_date.isnot(None),
            Employee.termination_date >= month_start,
            Employee.termination_date <= target_date,
        )
        .count()
    )
    active_headcount = db.query(Employee).filter(Employee.status == "activo").count()
    turnover_rate_pct = round((monthly_exits / max(1, active_headcount)) * 100.0, 2)

    employees_over_20_vacation_days = (
        db.query(Balance)
        .join(Employee, Employee.id == Balance.employee_id)
        .filter(Employee.status == "activo", Balance.available_days > 20)
        .count()
    )

    payload_json = {
        "absences_last_30_days": absences_last_30_days,
        "top_5_topics": top_5_topics,
        "absences_by_type": [{"name": k, "value": v} for k, v in by_type_map.items()],
        "absences_by_department": [{"department": k, "count": v} for k, v in by_dept_map.items()],
        "pending_requests_list": pending_list,
        "unanswered_questions": unanswered_questions,
        "active_headcount": active_headcount,
    }

    summary_input = {
        "report_date": target_date.strftime("%d/%m/%Y"),
        "absences_today": absences_today,
        "pending_requests": pending_requests,
        "pending_over_3_days": pending_over_3,
        "active_disabilities": active_disabilities,
        "resolved_without_escalation_pct": resolved_pct,
        "turnover_rate_pct": turnover_rate_pct,
        "employees_over_20_vacation_days": employees_over_20_vacation_days,
        "prev_day_chat_volume": prev_day_chat_volume,
        "prev_day_avg_latency_ms": prev_day_avg_latency_ms,
    }
    executive_summary = _build_executive_summary(summary_input)

    existing = db.query(DailyReport).filter(DailyReport.report_date == target_date).first()
    if existing:
        report = existing
    else:
        report = DailyReport(report_date=target_date)
        db.add(report)

    report.absences_today = absences_today
    report.pending_requests = pending_requests
    report.pending_over_3_days = pending_over_3
    report.active_disabilities = active_disabilities
    report.resolved_without_escalation_pct = resolved_pct
    report.monthly_disability_days = monthly_disability_days
    report.monthly_hires = monthly_hires
    report.monthly_exits = monthly_exits
    report.turnover_rate_pct = turnover_rate_pct
    report.employees_over_20_vacation_days = employees_over_20_vacation_days
    report.prev_day_chat_volume = prev_day_chat_volume
    report.prev_day_avg_latency_ms = prev_day_avg_latency_ms
    report.payload_json = payload_json
    report.executive_summary = executive_summary
    report.generated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(report)
    return report
