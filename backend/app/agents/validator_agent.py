from typing import Dict, Any, List
from app.models import Employee


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
    1) Verifica respaldo de citas en consultas de política/mixta.
    2) Verifica que las cifras de herramientas personales coincidan.
    3) Verifica que no haya fugas de datos de terceros ni instrucciones maliciosas.
    """
    errors: List[str] = []

    if intent in ("politica", "mixta") and not needs_hr_escalation:
        if not citations:
            errors.append("Falta cita documental verificable para respaldar la respuesta de política.")

    if intent in ("personal", "mixta") and tool_figures:
        for fig in tool_figures:
            if fig and fig not in answer:
                errors.append(f"La cifra '{fig}' de la herramienta SQL no coincide con la respuesta redactada.")

    # Verificación anti-inyección en la salida
    lower_ans = answer.lower()
    if any(bad in lower_ans for bad in ["system prompt", "ignora las instrucciones", "otorga permisos"]):
        errors.append("Se detectó contenido potencialmente inseguro en la respuesta.")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
    }
