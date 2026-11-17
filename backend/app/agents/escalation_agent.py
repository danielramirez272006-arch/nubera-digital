from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import Employee, Ticket, TicketHistory


SENSITIVE_KEYWORDS = [
    "acoso", "hostigamiento", "discriminacion", "nom-035", "etica",
    "incapacidad", "salud", "enfermedad", "salario", "sueldo", "nomina",
]


def build_ticket_summary(question: str, topic: str, employee: Employee) -> tuple[str, bool]:
    q_low = question.lower()
    is_sensitive = any(k in q_low for k in SENSITIVE_KEYWORDS)
    summary = (
        f"Colaborador: {employee.full_name} ({employee.employee_code}, {employee.department})\n"
        f"Tema: {topic}\n"
        f"Consulta original: {question}\n"
        f"Motivo de escalamiento: No se encontró respaldo suficiente en las políticas vigentes o requiere atención directa de RRHH."
    )
    return summary, is_sensitive


def create_ticket(
    db: Session,
    employee: Employee,
    topic: str,
    confirmed_summary: str,
    is_sensitive: bool = False,
) -> Ticket:
    year = datetime.now(timezone.utc).year
    count = db.query(Ticket).count() + 1
    folio = f"TKT-{year}-{count:04d}"

    ticket = Ticket(
        folio=folio,
        employee_id=employee.id,
        topic=topic,
        confirmed_summary=confirmed_summary,
        status="abierto",
        assigned_to="Laura Patricia Mendoza Ortega" if is_sensitive else "Diego Alejandro Santos Rivera",
        is_sensitive=is_sensitive,
    )
    db.add(ticket)
    db.flush()

    db.add(
        TicketHistory(
            ticket_id=ticket.id,
            actor_name=employee.full_name,
            action="Creación de ticket",
            notes="Ticket creado tras confirmación explícita del colaborador desde el portal.",
        )
    )
    db.commit()
    db.refresh(ticket)
    return ticket
