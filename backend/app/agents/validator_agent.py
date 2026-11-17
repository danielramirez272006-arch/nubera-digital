from typing import Dict, Any, List
from app.models import Employee

CONTRADICTION_PHRASES = [
    "no puedo responder",
    "no tengo acceso a tus datos",
    "no se encontró una política aplicable",
    "no cuento con esa información",
]


def validate_response(
    current_user: Employee,
    intent: str,
    answer: str,
    citations: List[Dict[str, Any]],
    tool_figures: List[str],
    needs_hr_escalation: bool,
) -> Dict[str, Any]:
    """
    Agente validador:
    1) Verifica respaldo de citas en consultas de política o mixta.
    2) Verifica que las cifras de herramientas SQL (dato_personal / mixta) coincidan exactamente.
    3) Detecta contradicciones en consultas mixtas (ej. mostrar saldo y luego negar acceso).
    4) Verifica ausencia de instrucciones maliciosas.
    """
    errors: List[str] = []
    lower_ans = answer.lower()

    if intent in ("politica", "mixta") and not needs_hr_escalation:
        if not citations:
            errors.append("Falta cita documental verificable para respaldar la respuesta de política.")

    if intent in ("dato_personal", "mixta") and tool_figures:
        for fig in tool_figures:
            if fig and fig not in answer:
                errors.append(f"La cifra '{fig}' de la herramienta SQL no coincide con la respuesta redactada.")

    if intent == "mixta" and tool_figures:
        if any(phrase in lower_ans for phrase in CONTRADICTION_PHRASES):
            errors.append("Contradicción detectada en consulta mixta: se incluyen datos personales junto con una negativa de respuesta.")

    if any(bad in lower_ans for bad in ["system prompt", "ignora las instrucciones", "otorga permisos"]):
        errors.append("Se detectó contenido potencialmente inseguro en la respuesta.")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
    }
