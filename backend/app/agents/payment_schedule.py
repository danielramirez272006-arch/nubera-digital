from datetime import date, datetime, timedelta
import re
from typing import Dict, Any, Set
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session

from app.config import settings
from app.models import DocumentChunk, DriveDocument


def _parse_calendar_from_db(db: Session) -> tuple[list[tuple[date, str]], Set[date]]:
    """Lee fechas programadas de Pagos 2026 y feriados de Feriados 2026 desde el índice documental."""
    scheduled: list[tuple[date, str]] = []
    holidays: Set[date] = set()

    chunks = (
        db.query(DocumentChunk)
        .join(DriveDocument, DriveDocument.id == DocumentChunk.document_id)
        .filter(DriveDocument.status == "activo")
        .all()
    )
    for c in chunks:
        sec_low = c.section.lower()
        if "pagos 2026" in sec_low:
            for line in c.content.splitlines():
                if "pago semanal" in line.lower():
                    m = re.search(r"\b(202\d-\d{2}-\d{2})\b", line)
                    if m:
                        d = date.fromisoformat(m.group(1))
                        status = "Confirmado" if "confirmado" in line.lower() else "Programado"
                        scheduled.append((d, status))
        elif "feriados 2026" in sec_low:
            for line in c.content.splitlines():
                m = re.search(r"\b(202\d-\d{2}-\d{2})\b", line)
                if m:
                    holidays.add(date.fromisoformat(m.group(1)))

    scheduled.sort(key=lambda x: x[0])
    return scheduled, holidays


def get_next_payment_info(db: Session, ref_date: date | None = None) -> Dict[str, Any]:
    """
    Calcula el próximo pago semanal (viernes) conforme a RH-05 y el Calendario de pagos 2026 (RH-12).
    Distingue fecha programada de fecha efectiva confirmada y considera adelantos por cierre bancario.
    """
    if ref_date is None:
        ref_date = datetime.now(ZoneInfo(settings.TIMEZONE)).date()

    scheduled_list, holidays = _parse_calendar_from_db(db)

    scheduled_date: date | None = None
    cal_status = "Programado"
    for d, st in scheduled_list:
        if d >= ref_date:
            scheduled_date = d
            cal_status = st
            break

    if scheduled_date is None:
        # Cálculo semanal estándar (viernes = 4)
        days_until_friday = (4 - ref_date.weekday()) % 7
        scheduled_date = ref_date + timedelta(days=days_until_friday)

    effective_date = scheduled_date
    is_advanced = False
    while effective_date in holidays or effective_date.weekday() >= 5:
        effective_date -= timedelta(days=1)
        is_advanced = True

    return {
        "scheduled_date": scheduled_date,
        "effective_date": effective_date if cal_status == "Confirmado" else None,
        "projected_date": effective_date,
        "is_advanced": is_advanced,
        "status": "Confirmado por Nómina" if cal_status == "Confirmado" else "Programado (fecha efectiva pendiente de validación por Nómina)",
        "source": "RH-05 Política salarial y calendario de pagos / RH-12 Pagos 2026",
    }
