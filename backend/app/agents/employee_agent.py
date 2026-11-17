from datetime import datetime
from typing import Dict, Any
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Employee, Balance, LeaveRequest, Disability
from app.agents.embeddings import normalize_text
from app.agents.payment_schedule import get_next_payment_info
from app.agents.vacation_rules import compute_vacation_entitlement


def answer_employee_question(db: Session, current_user: Employee, question: str) -> Dict[str, Any]:
    """
    Agente de datos del colaborador: consultas parametrizadas de solo lectura
    filtradas estrictamente por current_user.id.
    """
    q_norm = normalize_text(question)

    if any(k in q_norm for k in ["pago", "nomina", "fecha de pago", "proximo pago", "cuando pagan", "viernes", "semanal"]):
        today = datetime.now(ZoneInfo(settings.TIMEZONE)).date()
        pay_info = get_next_payment_info(db, today)
        sched_str = pay_info["scheduled_date"].strftime("%d/%m/%Y")
        proj_str = pay_info["projected_date"].strftime("%d/%m/%Y")
        eff_str = pay_info["effective_date"].strftime("%d/%m/%Y") if pay_info["effective_date"] else "pendiente de validación por Nómina"
        adv_note = (
            f" Por cierre bancario o feriado, se proyecta adelanto al día hábil anterior (**{proj_str}**)."
            if pay_info["is_advanced"]
            else ""
        )
        return {
            "answer": (
                f"Hola {current_user.full_name}, conforme al esquema de pagos semanales los viernes (RH-05 / RH-12), "
                f"tu próxima fecha programada de pago es el **{sched_str}** (estado: {pay_info['status']}; "
                f"fecha efectiva confirmada: {eff_str}).{adv_note}"
            ),
            "data_type": "pago",
            "tool_figures": [sched_str],
        }

    if any(k in q_norm for k in ["evaluacion", "desempeno", "revision"]):
        rev_str = current_user.next_review_date.strftime("%d/%m/%Y") if current_user.next_review_date else "Próximo ciclo semestral"
        return {
            "answer": (
                f"Hola {current_user.full_name}, tu próxima evaluación de desempeño está programada para el **{rev_str}**."
            ),
            "data_type": "evaluacion",
            "tool_figures": [rev_str],
        }

    if any(k in q_norm for k in ["vacacion", "dias", "saldo", "quedan", "disponible", "vencen", "caducan", "proximo ano"]):
        balance = (
            db.query(Balance)
            .filter(Balance.employee_id == current_user.id)
            .order_by(Balance.year.desc())
            .first()
        )
        if not balance:
            return {
                "answer": f"No se encontró un registro de saldo vacacional vigente para tu cuenta ({current_user.full_name}).",
                "data_type": "vacaciones",
                "tool_figures": [],
            }
        today = datetime.now(ZoneInfo(settings.TIMEZONE)).date()
        vac_info = compute_vacation_entitlement(current_user.hire_date, today)
        ent_str = f"{float(balance.entitled_days):g}"
        used_str = f"{float(balance.used_days):g}"
        pend_str = f"{float(balance.pending_days):g}"
        avail_str = f"{float(balance.available_days):g}"
        anniv_str = vac_info["anniversary_date"].strftime("%d/%m/%Y")
        p_start_str = vac_info["period_start"].strftime("%d/%m/%Y")
        p_end_str = vac_info["period_end"].strftime("%d/%m/%Y")
        dead_str = vac_info["six_month_deadline"].strftime("%d/%m/%Y")
        return {
            "answer": (
                f"Hola {current_user.full_name}, tu ingreso fue el **{current_user.hire_date.strftime('%d/%m/%Y')}** "
                f"({vac_info['years_of_service']} años cumplidos; último aniversario: **{anniv_str}**). "
                f"En tu periodo vigente (**{p_start_str} al {p_end_str}**) tienes **{avail_str} días disponibles** "
                f"de vacaciones (**{ent_str} días asignados** según tabla RH-01, **{used_str} disfrutados** y "
                f"**{pend_str} días reservados en solicitudes pendientes**). "
                f"Conforme a RH-01, el periodo se asigna por aniversario (puede cruzar diciembre) y debe programarse "
                f"dentro de los **6 meses posteriores al aniversario** (fecha límite de referencia: **{dead_str}**; "
                f"si existen días pendientes, Operaciones de RRHH revisa el caso para agendar su disfrute)."
            ),
            "data_type": "vacaciones",
            "tool_figures": [avail_str, ent_str, pend_str],
        }

    if any(k in q_norm for k in ["incapacidad", "incapacidades"]):
        dis = (
            db.query(Disability)
            .filter(Disability.employee_id == current_user.id)
            .order_by(Disability.start_date.desc())
            .limit(3)
            .all()
        )
        if not dis:
            return {
                "answer": f"No tienes incapacidades registradas en tu historial, {current_user.full_name}.",
                "data_type": "incapacidades",
                "tool_figures": [],
            }
        lines = [
            f"- {d.disability_type.replace('_', ' ').capitalize()} ({d.start_date.strftime('%d/%m/%Y')} al {d.end_date.strftime('%d/%m/%Y')}, {d.days_count} días): **{d.status.upper()}**"
            for d in dis
        ]
        return {
            "answer": "Tus incapacidades registradas son:\n" + "\n".join(lines),
            "data_type": "incapacidades",
            "tool_figures": [str(d.days_count) for d in dis],
        }

    if any(k in q_norm for k in ["solicitud", "solicitudes", "estatus", "estado", "aprobada", "pendiente", "permiso"]):
        reqs = (
            db.query(LeaveRequest)
            .filter(LeaveRequest.employee_id == current_user.id)
            .order_by(LeaveRequest.created_at.desc())
            .limit(5)
            .all()
        )
        if not reqs:
            return {
                "answer": f"No tienes solicitudes recientes registradas en tu historial, {current_user.full_name}.",
                "data_type": "solicitudes",
                "tool_figures": [],
            }
        lines = [
            f"- {r.request_type.replace('_', ' ').capitalize()} del {r.start_date.strftime('%d/%m/%Y')} "
            f"al {r.end_date.strftime('%d/%m/%Y')} ({float(r.days_count):g} días): **{r.status.upper()}**"
            for r in reqs
        ]
        return {
            "answer": "Estas son tus solicitudes más recientes:\n" + "\n".join(lines),
            "data_type": "solicitudes",
            "tool_figures": [],
        }

    if any(k in q_norm for k in ["puesto", "departamento", "antiguedad", "ingreso", "salario", "sueldo", "jefe", "lider", "perfil"]):
        return {
            "answer": (
                f"Tu ficha laboral registra el puesto de **{current_user.position}** en el departamento de "
                f"**{current_user.department}**, con fecha de ingreso el **{current_user.hire_date.strftime('%d/%m/%Y')}** "
                f"y líder directo **{current_user.manager_name or 'Dirección de Área'}**."
            ),
            "data_type": "perfil",
            "tool_figures": [],
        }

    balance = (
        db.query(Balance)
        .filter(Balance.employee_id == current_user.id)
        .order_by(Balance.year.desc())
        .first()
    )
    avail = f"{float(balance.available_days):g}" if balance else "0"
    pending_count = (
        db.query(LeaveRequest)
        .filter(LeaveRequest.employee_id == current_user.id, LeaveRequest.status == "pendiente")
        .count()
    )
    return {
        "answer": (
            f"Resumen de tu cuenta ({current_user.full_name}, {current_user.employee_code}): "
            f"tienes **{avail} días de vacaciones disponibles** y **{pending_count} solicitud(es) pendiente(s)**."
        ),
        "data_type": "resumen",
        "tool_figures": [avail, str(pending_count)],
    }
