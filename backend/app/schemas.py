from datetime import date, datetime
from typing import List, Optional, Any
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class UserSession(BaseModel):
    id: int
    employee_code: str
    email: str
    full_name: str
    role: str
    department: str
    position: str
    hire_date: date
    next_payment_date: Optional[date] = None
    next_review_date: Optional[date] = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    redirect_to: str
    user: UserSession


class Citation(BaseModel):
    drive_file_id: str = ""
    policy_code: str
    title: str
    section: str
    version: str
    effective_date: str = "2026-01-01"
    owner: str = "Dirección de Talento y Cultura"
    drive_url: str
    snippet: str = ""
    score: Optional[float] = None


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=1500)
    session_id: Optional[str] = "default"


class ChatResponse(BaseModel):
    id: int
    trace_id: str
    session_id: str
    question: str
    answer: str
    intent: str
    agent_used: str
    prompt_version: str
    topic: str
    citations: List[Citation] = []
    latency_ms: int
    outcome: str
    needs_hr_escalation: bool = False
    suggested_ticket_summary: Optional[str] = None
    helpful: Optional[bool] = None
    created_at: datetime


class ChatFeedbackRequest(BaseModel):
    helpful: bool


class ConversationOut(BaseModel):
    id: str
    title: str
    updated_at: datetime


class BalanceOut(BaseModel):
    year: int
    entitled_days: float
    used_days: float
    pending_days: float
    available_days: float
    expiration_date: date


class LeaveRequestOut(BaseModel):
    id: int
    employee_name: Optional[str] = None
    department: Optional[str] = None
    request_type: str
    start_date: date
    end_date: date
    days_count: float
    status: str
    reason: Optional[str] = None
    approver_notes: Optional[str] = None
    created_at: datetime


class LeaveRequestDecision(BaseModel):
    status: str = Field(..., pattern="^(aprobada|rechazada)$")
    approver_notes: Optional[str] = None


class DisabilityOut(BaseModel):
    id: int
    folio_imss: str
    disability_type: str
    start_date: date
    end_date: date
    days_count: int
    status: str


class MyDataResponse(BaseModel):
    employee: UserSession
    balances: List[BalanceOut]
    recent_requests: List[LeaveRequestOut]
    disabilities: List[DisabilityOut]
    updated_at: datetime


class TicketCreateRequest(BaseModel):
    topic: str = Field(..., min_length=3, max_length=120)
    confirmed_summary: str = Field(..., min_length=10, max_length=2000)
    is_sensitive: bool = False


class TicketUpdateRequest(BaseModel):
    status: str = Field(..., pattern="^(abierto|en_proceso|resuelto|cerrado)$")
    notes: str = Field(..., min_length=3, max_length=1000)
    assigned_to: Optional[str] = None


class TicketHistoryOut(BaseModel):
    id: int
    actor_name: str
    action: str
    notes: str
    created_at: datetime


class TicketOut(BaseModel):
    id: int
    folio: str
    employee_name: str
    department: str
    topic: str
    confirmed_summary: str
    status: str
    assigned_to: str
    is_sensitive: bool
    created_at: datetime
    updated_at: datetime
    history: List[TicketHistoryOut] = []


class DocumentOut(BaseModel):
    id: int
    drive_file_id: str
    policy_code: str
    title: str
    mime_type: str
    version: str
    effective_date: str
    owner: str
    drive_url: str
    status: str
    chunks_count: int
    last_synced_at: datetime


class DocumentAlertOut(BaseModel):
    id: int
    drive_file_id: str
    title: str
    alert_type: str
    severity: str
    detail: str
    resolved: bool
    created_at: datetime


class DocumentsStatusResponse(BaseModel):
    last_synced_at: Optional[datetime] = None
    total_active_documents: int
    total_chunks: int
    documents: List[DocumentOut]
    alerts: List[DocumentAlertOut]


class DashboardReportResponse(BaseModel):
    report_date: date
    absences_today: int
    pending_requests: int
    pending_over_3_days: int
    active_disabilities: int
    resolved_without_escalation_pct: float
    monthly_disability_days: int
    monthly_hires: int
    monthly_exits: int
    turnover_rate_pct: float
    employees_over_20_vacation_days: int
    prev_day_chat_volume: int
    prev_day_avg_latency_ms: int
    executive_summary: str
    payload_json: dict[str, Any]
    generated_at: datetime


class SystemStatusResponse(BaseModel):
    environment: str
    database_mode: str
    drive_mode: str
    llm_mode: str
    timezone: str
    demo_mode: bool
    active_policies_count: int
    active_chunks_count: int
