from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import random
import uuid
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Employee,
    Balance,
    LeaveRequest,
    Disability,
    Movement,
    ChatConversation,
    ChatLog,
    Ticket,
    TicketHistory,
    DailyReport,
)
from app.auth import hash_password
from app.agents.ingestion_agent import sync_drive_policies
from app.agents.analyst_agent import generate_daily_report
from app.agents.payment_schedule import get_next_payment_info


DEPARTMENTS = [
    ("Ingeniería", ["Desarrollador Backend Sr.", "Ingeniero Frontend", "Arquitecto Cloud", "QA Automation"]),
    ("Producto", ["Product Manager", "Product Owner", "Business Analyst"]),
    ("Diseño UX", ["Diseñador UX/UI", "UX Researcher"]),
    ("Datos & IA", ["Científico de Datos", "Ingeniero de Datos", "ML Engineer"]),
    ("Operaciones Cloud", ["Site Reliability Engineer", "DevOps Engineer"]),
    ("Ventas B2B", ["Ejecutivo de Cuenta", "Solutions Consultant"]),
    ("Finanzas", ["Analista Contable", "Especialista Fiscal"]),
    ("Recursos Humanos", ["Especialista de Talento", "Generalista de RRHH"]),
]

FIRST_NAMES = [
    "Sofía", "Mateo", "Valentina", "Santiago", "Camila", "Sebastián", "Ximena", "Leonardo",
    "Regina", "Emiliano", "Mariana", "Diego", "Lucía", "Alejandro", "Daniela", "Gabriel",
    "Fernanda", "Rodrigo", "Paola", "Andrés", "Valeria", "Javier", "Natalia", "Ricardo",
    "Adriana", "Fernando", "Carolina", "Eduardo", "Mónica", "Héctor",
]

LAST_NAMES = [
    "Hernández", "García", "Martínez", "López", "González", "Pérez", "Rodríguez", "Sánchez",
    "Ramírez", "Cruz", "Flores", "Gómez", "Morales", "Vázquez", "Jiménez", "Reyes",
    "Díaz", "Torres", "Gutiérrez", "Ruiz", "Mendoza", "Aguilar", "Ortiz", "Moreno",
]


def seed_database(db: Session) -> None:
    sync_drive_policies(db)
    tz = ZoneInfo(settings.TIMEZONE)
    today = datetime.now(tz).date()
    next_pay_info = get_next_payment_info(db, today)
    next_pay = next_pay_info["projected_date"]

    if db.query(Employee).count() >= 50:
        # Actualización controlada para mantener vigente la fecha de próximo pago semanal (viernes)
        outdated = (
            db.query(Employee)
            .filter(Employee.status == "activo", (Employee.next_payment_date.is_(None)) | (Employee.next_payment_date < today) | (Employee.next_payment_date != next_pay))
            .all()
        )
        if outdated:
            for emp in outdated:
                emp.next_payment_date = next_pay
            db.commit()

        if not db.query(DailyReport).filter(DailyReport.report_date == today).first():
            generate_daily_report(db, today)
        return

    rng = random.Random(20261117)
    next_rev = date(today.year, 12, 10) if today.month < 12 else date(today.year + 1, 6, 15)

    collab_hash = hash_password("Colaborador123!")
    hr_hash = hash_password("Rrhh123!")

    fixed_users = [
        {
            "employee_code": "NUB-001",
            "email": "ana.garcia@nubera.mx",
            "password_hash": collab_hash,
            "full_name": "Ana Sofía García López",
            "role": "colaborador",
            "department": "Ingeniería",
            "position": "Desarrolladora Backend Sr.",
            "hire_date": today - timedelta(days=920),
            "status": "activo",
            "salary_mxn": 58000,
            "manager_name": "Carlos Alberto Méndez",
            "entitled": 16,
            "used": 2,
            "pending": 0,
        },
        {
            "employee_code": "NUB-002",
            "email": "carlos.ruiz@nubera.mx",
            "password_hash": collab_hash,
            "full_name": "Carlos Eduardo Ruiz Morales",
            "role": "colaborador",
            "department": "Producto",
            "position": "Product Manager",
            "hire_date": today - timedelta(days=1850),
            "status": "activo",
            "salary_mxn": 64000,
            "manager_name": "Valeria Domínguez",
            "entitled": 24,
            "used": 2,
            "pending": 0,
        },
        {
            "employee_code": "NUB-003",
            "email": "laura.mendoza@nubera.mx",
            "password_hash": hr_hash,
            "full_name": "Laura Patricia Mendoza Ortega",
            "role": "rrhh",
            "department": "Recursos Humanos",
            "position": "Directora de Talento y Cultura",
            "hire_date": today - timedelta(days=1400),
            "status": "activo",
            "salary_mxn": 72000,
            "manager_name": "Dirección General",
            "entitled": 20,
            "used": 5,
            "pending": 0,
        },
        {
            "employee_code": "NUB-004",
            "email": "diego.santos@nubera.mx",
            "password_hash": hr_hash,
            "full_name": "Diego Alejandro Santos Rivera",
            "role": "rrhh",
            "department": "Recursos Humanos",
            "position": "Especialista de Nómina y RRHH",
            "hire_date": today - timedelta(days=750),
            "status": "activo",
            "salary_mxn": 46000,
            "manager_name": "Laura Patricia Mendoza Ortega",
            "entitled": 14,
            "used": 4,
            "pending": 0,
        },
    ]

    created_employees: list[Employee] = []
    for u in fixed_users:
        emp = Employee(
            employee_code=u["employee_code"],
            email=u["email"],
            password_hash=u["password_hash"],
            full_name=u["full_name"],
            role=u["role"],
            department=u["department"],
            position=u["position"],
            hire_date=u["hire_date"],
            status=u["status"],
            salary_mxn=u["salary_mxn"],
            manager_name=u["manager_name"],
            next_payment_date=next_pay,
            next_review_date=next_rev,
        )
        db.add(emp)
        db.flush()
        created_employees.append(emp)

        avail = u["entitled"] - u["used"] - u["pending"]
        db.add(
            Balance(
                employee_id=emp.id,
                year=today.year,
                entitled_days=u["entitled"],
                used_days=u["used"],
                pending_days=u["pending"],
                available_days=avail,
                expiration_date=date(today.year + 1, 3, 31),
            )
        )

    for idx in range(5, 56):
        fn = rng.choice(FIRST_NAMES)
        ln1 = rng.choice(LAST_NAMES)
        ln2 = rng.choice(LAST_NAMES)
        full_name = f"{fn} {ln1} {ln2}"
        dept, roles = rng.choice(DEPARTMENTS)
        pos = rng.choice(roles)
        if idx in (52, 53):
            hire_d = today - timedelta(days=rng.randint(2, 14))
            status = "activo"
            term_d = None
        elif idx in (54, 55):
            hire_d = today - timedelta(days=rng.randint(300, 900))
            status = "baja"
            term_d = today - timedelta(days=rng.randint(2, 12))
        else:
            hire_d = today - timedelta(days=rng.randint(120, 2100))
            status = "activo"
            term_d = None

        emp = Employee(
            employee_code=f"NUB-{idx:03d}",
            email=f"colaborador.{idx:03d}@nubera.mx",
            password_hash=collab_hash,
            full_name=full_name,
            role="colaborador",
            department=dept,
            position=pos,
            hire_date=hire_d,
            termination_date=term_d,
            status=status,
            salary_mxn=rng.randint(28, 78) * 1000,
            manager_name="Laura Patricia Mendoza Ortega" if dept == "Recursos Humanos" else "Líder de Área",
            next_payment_date=next_pay,
            next_review_date=next_rev,
        )
        db.add(emp)
        db.flush()
        created_employees.append(emp)

        if idx in (6, 9, 14, 19, 24, 31, 38):
            entitled = rng.choice([22, 24, 26])
            used = rng.choice([0, 1, 2])
        else:
            entitled = rng.choice([12, 14, 16, 18, 20])
            used = rng.randint(0, min(8, entitled - 2))

        db.add(
            Balance(
                employee_id=emp.id,
                year=today.year,
                entitled_days=entitled,
                used_days=used,
                pending_days=0,
                available_days=entitled - used,
                expiration_date=date(today.year + 1, 3, 31),
            )
        )

    for emp in created_employees:
        db.add(
            Movement(
                employee_id=emp.id,
                movement_type="ingreso",
                movement_date=emp.hire_date,
                days_delta=0,
                description=f"Ingreso a Nubera Digital como {emp.position} ({emp.department}).",
            )
        )
        if emp.termination_date:
            db.add(
                Movement(
                    employee_id=emp.id,
                    movement_type="baja",
                    movement_date=emp.termination_date,
                    days_delta=0,
                    description="Baja registrada en el periodo.",
                )
            )

    leave_types = ["vacaciones", "permiso_con_goce", "home_office", "incapacidad"]
    for _ in range(48):
        emp = rng.choice(created_employees[4:50])
        ltype = rng.choice(leave_types)
        offset_days = rng.randint(2, 88)
        s_date = today - timedelta(days=offset_days)
        dur = rng.randint(1, 4)
        e_date = s_date + timedelta(days=dur - 1)
        db.add(
            LeaveRequest(
                employee_id=emp.id,
                request_type=ltype,
                start_date=s_date,
                end_date=e_date,
                days_count=dur,
                status="aprobada",
                reason=f"Registro histórico de {ltype.replace('_', ' ')}.",
                created_at=datetime.combine(s_date - timedelta(days=5), datetime.min.time()).replace(tzinfo=timezone.utc),
                resolved_at=datetime.combine(s_date - timedelta(days=3), datetime.min.time()).replace(tzinfo=timezone.utc),
            )
        )
        if ltype == "incapacidad":
            db.add(
                Disability(
                    employee_id=emp.id,
                    folio_imss=f"IMSS-{rng.randint(100000, 999999)}",
                    disability_type="enfermedad_general",
                    start_date=s_date,
                    end_date=e_date,
                    days_count=dur,
                    status="concluida",
                )
            )
        db.add(
            Movement(
                employee_id=emp.id,
                movement_type="vacaciones_tomadas" if ltype == "vacaciones" else ("incapacidad_imss" if ltype == "incapacidad" else "permiso"),
                movement_date=s_date,
                days_delta=-dur if ltype == "vacaciones" else 0,
                description=f"{ltype.replace('_', ' ').capitalize()} aprobada ({dur} días).",
            )
        )

    active_today_specs = [
        (created_employees[5], "vacaciones", today - timedelta(days=1), today + timedelta(days=2), 4),
        (created_employees[8], "vacaciones", today, today + timedelta(days=1), 2),
        (created_employees[11], "permiso_con_goce", today, today, 1),
        (created_employees[15], "incapacidad", today - timedelta(days=2), today + timedelta(days=3), 6),
        (created_employees[22], "incapacidad", today - timedelta(days=1), today + timedelta(days=4), 6),
    ]
    for emp, ltype, s_d, e_d, cnt in active_today_specs:
        db.add(
            LeaveRequest(
                employee_id=emp.id,
                request_type=ltype,
                start_date=s_d,
                end_date=e_d,
                days_count=cnt,
                status="aprobada",
                reason="Ausencia vigente al corte.",
                created_at=datetime.combine(s_d - timedelta(days=4), datetime.min.time()).replace(tzinfo=timezone.utc),
                resolved_at=datetime.combine(s_d - timedelta(days=2), datetime.min.time()).replace(tzinfo=timezone.utc),
            )
        )
        if ltype == "incapacidad":
            db.add(
                Disability(
                    employee_id=emp.id,
                    folio_imss=f"IMSS-{rng.randint(100000, 999999)}",
                    disability_type="enfermedad_general",
                    start_date=s_d,
                    end_date=e_d,
                    days_count=cnt,
                    status="activa",
                )
            )

    pending_specs = [
        (created_employees[0], "vacaciones", today + timedelta(days=15), today + timedelta(days=18), 4, 5),
        (created_employees[7], "vacaciones", today + timedelta(days=20), today + timedelta(days=24), 5, 6),
        (created_employees[12], "permiso_con_goce", today + timedelta(days=6), today + timedelta(days=7), 2, 4),
        (created_employees[18], "vacaciones", today + timedelta(days=18), today + timedelta(days=20), 3, 1),
        (created_employees[25], "permiso_sin_goce", today + timedelta(days=25), today + timedelta(days=29), 5, 2),
    ]
    for emp, ltype, s_d, e_d, cnt, days_ago in pending_specs:
        created_ts = datetime.combine(today - timedelta(days=days_ago), datetime.min.time()).replace(tzinfo=timezone.utc)
        db.add(
            LeaveRequest(
                employee_id=emp.id,
                request_type=ltype,
                start_date=s_d,
                end_date=e_d,
                days_count=cnt,
                status="pendiente",
                reason="Solicitud en espera de validación de líder / RRHH.",
                created_at=created_ts,
            )
        )

    # Tickets de ejemplo
    t1 = Ticket(
        folio=f"TKT-{today.year}-0001",
        employee_id=created_employees[0].id,
        topic="Prestaciones y beneficios",
        confirmed_summary="Solicitud de aclaración sobre cobertura dental en el SGMM.",
        status="en_proceso",
        assigned_to="Diego Alejandro Santos Rivera",
        is_sensitive=False,
    )
    db.add(t1)
    db.flush()
    db.add(TicketHistory(ticket_id=t1.id, actor_name=created_employees[0].full_name, action="Creación de ticket", notes="Ticket enviado desde el chat."))
    db.add(TicketHistory(ticket_id=t1.id, actor_name="Diego Alejandro Santos Rivera", action="En revisión", notes="Se solicitó cotización de cobertura dental a la aseguradora."))

    t2 = Ticket(
        folio=f"TKT-{today.year}-0002",
        employee_id=created_employees[1].id,
        topic="Ética y NOM-035",
        confirmed_summary="Consulta confidencial sobre canal de seguimiento NOM-035.",
        status="abierto",
        assigned_to="Laura Patricia Mendoza Ortega",
        is_sensitive=True,
    )
    db.add(t2)
    db.flush()
    db.add(TicketHistory(ticket_id=t2.id, actor_name=created_employees[1].full_name, action="Creación de ticket", notes="Caso marcado como sensible."))

    sample_chats = [
        ("¿Con cuánta anticipación pido vacaciones?", "politica", "Agente de Políticas", "Vacaciones", "resuelta", 42),
        ("¿Cuántos días me quedan?", "dato_personal", "Agente de Datos del Colaborador", "Vacaciones", "resuelta", 28),
        ("¿Cuántos días dura la incapacidad por maternidad?", "politica", "Agente de Políticas", "Incapacidades", "resuelta", 55),
        ("¿Qué días pagan la quincena?", "politica", "Agente de Políticas", "Pagos y prestaciones", "resuelta", 35),
        ("¿Cuántos días dan por paternidad?", "politica", "Agente de Políticas", "Permisos", "resuelta", 48),
        ("¿Cuál es el horario flexible de entrada?", "politica", "Agente de Políticas", "Trabajo remoto", "resuelta", 39),
        ("¿La empresa da bono por mascotas?", "politica", "Agente de Políticas", "Otras consultas", "escalada_rrhh", 61),
        ("¿Hay apoyo económico para clases de natación?", "politica", "Agente de Políticas", "Otras consultas", "escalada_rrhh", 58),
    ]
    for day_offset in range(1, 15):
        c_date = today - timedelta(days=day_offset)
        conv_id = f"seed-conv-{day_offset}"
        emp_sample = created_employees[day_offset % 10]
        db.add(ChatConversation(id=conv_id, employee_id=emp_sample.id, title=f"Consulta {c_date.isoformat()}"))
        for _ in range(rng.randint(3, 6)):
            q, intent, agent, topic, outcome, lat = rng.choice(sample_chats)
            emp = rng.choice(created_employees[:20])
            db.add(
                ChatLog(
                    trace_id=uuid.uuid4().hex[:16],
                    employee_id=emp.id,
                    session_id=conv_id,
                    question=q,
                    answer="Respuesta registrada en historial de demostración.",
                    intent=intent,
                    agent_used=agent,
                    prompt_version="1.2.0",
                    topic=topic,
                    citations_json=[],
                    latency_ms=lat + rng.randint(5, 45),
                    outcome=outcome,
                    created_at=datetime.combine(c_date, datetime.min.time()).replace(hour=11, tzinfo=timezone.utc),
                )
            )

    db.commit()

    for d_off in range(9, -1, -1):
        generate_daily_report(db, today - timedelta(days=d_off))
