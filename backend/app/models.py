from datetime import date, datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    DateTime,
    Numeric,
    Text,
    Boolean,
    ForeignKey,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.database import Base
from app.config import settings

if settings.is_postgres:
    from pgvector.sqlalchemy import Vector
    EmbeddingColumnType = Vector(settings.EMBEDDING_DIM)
else:
    EmbeddingColumnType = JSON


def utcnow():
    return datetime.now(timezone.utc)


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    employee_code = Column(String(20), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(150), nullable=False)
    role = Column(String(20), nullable=False)  # 'colaborador' | 'rrhh'
    department = Column(String(80), nullable=False)
    position = Column(String(100), nullable=False)
    hire_date = Column(Date, nullable=False)
    termination_date = Column(Date, nullable=True)
    status = Column(String(20), nullable=False, default="activo")
    salary_mxn = Column(Numeric(12, 2), nullable=False, default=0)
    manager_name = Column(String(150), nullable=True)
    next_payment_date = Column(Date, nullable=True)
    next_review_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    balances = relationship("Balance", back_populates="employee", cascade="all, delete-orphan")
    leave_requests = relationship("LeaveRequest", back_populates="employee", cascade="all, delete-orphan")
    disabilities = relationship("Disability", back_populates="employee", cascade="all, delete-orphan")
    movements = relationship("Movement", back_populates="employee", cascade="all, delete-orphan")
    chat_logs = relationship("ChatLog", back_populates="employee", cascade="all, delete-orphan")
    tickets = relationship("Ticket", back_populates="employee", cascade="all, delete-orphan")


class Balance(Base):
    __tablename__ = "balances"
    __table_args__ = (UniqueConstraint("employee_id", "year", name="uq_balance_emp_year"),)

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    entitled_days = Column(Numeric(6, 2), nullable=False)
    used_days = Column(Numeric(6, 2), nullable=False, default=0)
    pending_days = Column(Numeric(6, 2), nullable=False, default=0)
    available_days = Column(Numeric(6, 2), nullable=False)
    expiration_date = Column(Date, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    employee = relationship("Employee", back_populates="balances")


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    request_type = Column(String(30), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    days_count = Column(Numeric(5, 2), nullable=False)
    status = Column(String(20), nullable=False, default="pendiente")
    reason = Column(Text, nullable=True)
    approver_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    employee = relationship("Employee", back_populates="leave_requests")


class Disability(Base):
    __tablename__ = "disabilities"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    folio_imss = Column(String(40), nullable=False)
    disability_type = Column(String(40), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    days_count = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="activa")
    created_at = Column(DateTime(timezone=True), default=utcnow)

    employee = relationship("Employee", back_populates="disabilities")


class Movement(Base):
    __tablename__ = "movements"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    movement_type = Column(String(40), nullable=False)
    movement_date = Column(Date, nullable=False)
    days_delta = Column(Numeric(6, 2), nullable=False, default=0)
    description = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    employee = relationship("Employee", back_populates="movements")


class DriveDocument(Base):
    __tablename__ = "drive_documents"

    id = Column(Integer, primary_key=True, index=True)
    drive_file_id = Column(String(128), unique=True, nullable=False)
    policy_code = Column(String(30), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    mime_type = Column(String(120), nullable=False)
    version = Column(String(40), nullable=False)
    effective_date = Column(String(40), nullable=False, default="2026-01-01")
    owner = Column(String(120), nullable=False, default="Dirección de Talento y Cultura")
    drive_url = Column(Text, nullable=False)
    content_hash = Column(String(64), nullable=False)
    status = Column(String(20), nullable=False, default="activo")
    last_synced_at = Column(DateTime(timezone=True), default=utcnow)

    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("drive_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    drive_file_id = Column(String(128), nullable=False)
    policy_code = Column(String(30), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    section = Column(String(200), nullable=False)
    version = Column(String(40), nullable=False)
    effective_date = Column(String(40), nullable=False, default="2026-01-01")
    owner = Column(String(120), nullable=False, default="Dirección de Talento y Cultura")
    drive_url = Column(Text, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(EmbeddingColumnType, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    document = relationship("DriveDocument", back_populates="chunks")


class DocumentAuditAlert(Base):
    __tablename__ = "document_audit_alerts"

    id = Column(Integer, primary_key=True, index=True)
    drive_file_id = Column(String(128), nullable=False)
    title = Column(String(200), nullable=False)
    alert_type = Column(String(40), nullable=False)
    severity = Column(String(20), nullable=False, default="media")
    detail = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="activa")  # activa | revisada | resuelta
    occurrence_count = Column(Integer, nullable=False, default=1)
    resolved = Column(Boolean, nullable=False, default=False)
    last_seen_at = Column(DateTime(timezone=True), default=utcnow)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class ChatConversation(Base):
    __tablename__ = "chat_conversations"

    id = Column(String(64), primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(160), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ChatLog(Base):
    __tablename__ = "chat_logs"

    id = Column(Integer, primary_key=True, index=True)
    trace_id = Column(String(64), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String(64), nullable=False, index=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    intent = Column(String(40), nullable=False)
    agent_used = Column(String(80), nullable=False)
    prompt_version = Column(String(40), nullable=False, default="1.2.0")
    topic = Column(String(60), nullable=False)
    citations_json = Column(JSON, nullable=False, default=list)
    latency_ms = Column(Integer, nullable=False)
    outcome = Column(String(30), nullable=False)
    helpful = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    employee = relationship("Employee", back_populates="chat_logs")


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    folio = Column(String(30), unique=True, nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    topic = Column(String(120), nullable=False)
    confirmed_summary = Column(Text, nullable=False)
    status = Column(String(30), nullable=False, default="abierto")
    assigned_to = Column(String(150), nullable=False, default="Laura Patricia Mendoza Ortega")
    is_sensitive = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    employee = relationship("Employee", back_populates="tickets")
    history = relationship("TicketHistory", back_populates="ticket", cascade="all, delete-orphan")


class TicketHistory(Base):
    __tablename__ = "ticket_history"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_name = Column(String(150), nullable=False)
    action = Column(String(80), nullable=False)
    notes = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    ticket = relationship("Ticket", back_populates="history")


class DailyReport(Base):
    __tablename__ = "daily_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_date = Column(Date, unique=True, nullable=False, index=True)
    absences_today = Column(Integer, nullable=False, default=0)
    pending_requests = Column(Integer, nullable=False, default=0)
    pending_over_3_days = Column(Integer, nullable=False, default=0)
    active_disabilities = Column(Integer, nullable=False, default=0)
    resolved_without_escalation_pct = Column(Numeric(5, 2), nullable=False, default=0)
    monthly_disability_days = Column(Integer, nullable=False, default=0)
    monthly_hires = Column(Integer, nullable=False, default=0)
    monthly_exits = Column(Integer, nullable=False, default=0)
    turnover_rate_pct = Column(Numeric(5, 2), nullable=False, default=0)
    employees_over_20_vacation_days = Column(Integer, nullable=False, default=0)
    prev_day_chat_volume = Column(Integer, nullable=False, default=0)
    prev_day_avg_latency_ms = Column(Integer, nullable=False, default=0)
    payload_json = Column(JSON, nullable=False)
    executive_summary = Column(Text, nullable=False)
    generated_at = Column(DateTime(timezone=True), default=utcnow)
