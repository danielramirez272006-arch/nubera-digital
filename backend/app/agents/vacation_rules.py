from datetime import date, timedelta
from typing import Dict, Any
import calendar


def _add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def compute_vacation_entitlement(hire_date: date, ref_date: date) -> Dict[str, Any]:
    """
    Calcula antigüedad, periodo vigente, aniversario, días según tabla RH-01 de Nubera Digital
    y plazo de disfrute de 6 meses posteriores al aniversario (LFT art. 81 y RH-01).
    """
    years = ref_date.year - hire_date.year
    if (ref_date.month, ref_date.day) < (hire_date.month, hire_date.day):
        years -= 1
    years = max(0, years)

    if years == 0:
        entitled = 0
        last_anniv = hire_date
        next_anniv = _add_months(hire_date, 12)
        deadline = _add_months(next_anniv, 6)
    else:
        if years in (1, 2):
            entitled = 15
        elif years == 3:
            entitled = 16
        elif years == 4:
            entitled = 18
        elif years == 5:
            entitled = 20
        elif 6 <= years <= 10:
            entitled = 22
        elif 11 <= years <= 15:
            entitled = 24
        elif 16 <= years <= 20:
            entitled = 26
        else:
            entitled = 26 + 2 * ((years - 16) // 5)

        last_anniv = date(
            hire_date.year + years,
            hire_date.month,
            min(hire_date.day, calendar.monthrange(hire_date.year + years, hire_date.month)[1]),
        )
        next_anniv = _add_months(last_anniv, 12)
        deadline = _add_months(last_anniv, 6)

    period_end = next_anniv - timedelta(days=1)
    return {
        "years_of_service": years,
        "entitled_days": entitled,
        "period_start": last_anniv,
        "period_end": period_end,
        "anniversary_date": last_anniv,
        "next_anniversary_date": next_anniv,
        "six_month_deadline": deadline,
    }
