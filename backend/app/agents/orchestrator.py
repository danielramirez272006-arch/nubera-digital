import json
import time
import uuid
from pathlib import Path
from typing import TypedDict, List, Dict, Any
from sqlalchemy.orm import Session
from langgraph.graph import StateGraph, END

from app.models import Employee, ChatLog, ChatConversation, DailyReport
from app.agents.embeddings import normalize_text
from app.agents.policy_agent import answer_policy_question
from app.agents.employee_agent import answer_employee_question
from app.agents.validator_agent import validate_response
from app.agents.escalation_agent import build_ticket_summary

PROMPT_REGISTRY_PATH = Path(__file__).resolve().parents[3] / "prompts" / "registry.json"


def _get_prompt_version() -> str:
    try:
        data = json.loads(PROMPT_REGISTRY_PATH.read_text(encoding="utf-8"))
        return data.get("orchestrator", {}).get("version", "1.2.0")
    except Exception:
        return "1.2.0"


THIRD_PARTY_PATTERNS = [
    "companero", "companera", "colega", "otro colaborador", "otra colaboradora",
    "otro empleado", "otra empleada", "le quedan a", "tiene mi ", "vacaciones de ",
    "saldo de ", "sueldo de ", "salario de ", "incapacidad de ", "incapacidades de ",
    "alguien mas", "tercero", "terceros", "mi equipo",
]

PERSONAL_PRONOUNS = [
    "me quedan", "tengo", "mi saldo", "mis vacaciones", "mis dias",
    "mis solicitudes", "mi solicitud", "mi puesto", "mi departamento",
    "mi ingreso", "mi antiguedad", "mi salario", "mi sueldo", "mi lider",
    "me corresponde", "me faltan", "cuantos dias me", "cuando entre",
    "mi proximo pago", "proxima fecha de pago", "mi evaluacion", "proxima evaluacion",
    "mis incapacidades",
]

POLICY_SIGNALS = [
    "puedo usarlos", "proximo ano", "siguiente ano", "caducan", "vencen",
    "anticipacion", "cuanto tiempo antes", "politica", "regla", "norma",
    "como pido", "como solicito", "requisitos", "cuantos dias dan",
    "prima vacacional", "aguinaldo", "vales", "fondo de ahorro", "imss",
    "maternidad", "paternidad", "matrimonio", "fallecimiento", "incapacidad",
    "home office", "remoto", "horario", "quincena", "pago", "bono", "mascotas",
    "sgmm", "seguro", "licencia", "permiso", "capacitacion", "certificacion",
    "etica", "acoso", "nom 035", "viaticos", "hospedaje", "equipo de computo",
]

REPORT_SIGNALS = [
    "reporte diario", "tasa de rotacion", "ausencias de hoy", "resumen ejecutivo",
    "indicadores de rrhh", "solicitudes pendientes del mes",
]


def _detect_topic(q_norm: str) -> str:
    if any(k in q_norm for k in ["vacacion", "prima vacacional", "proximo ano", "anticipacion"]):
        return "Vacaciones"
    if any(k in q_norm for k in ["permiso", "licencia", "paternidad", "matrimonio", "duelo", "fallecimiento"]):
        return "Permisos"
    if any(k in q_norm for k in ["incapacidad", "imss", "enfermedad", "maternidad", "salud", "riesgo"]):
        return "Incapacidades"
    if any(k in q_norm for k in ["pago", "nomina", "quincena", "aguinaldo", "vales", "fondo", "sueldo", "salario", "sgmm"]):
        return "Pagos y prestaciones"
    if any(k in q_norm for k in ["remoto", "home office", "hibrido", "horario"]):
        return "Trabajo remoto"
    if any(k in q_norm for k in ["evaluacion", "desempeno", "capacitacion", "certificacion"]):
        return "Desarrollo y desempeño"
    if any(k in q_norm for k in ["etica", "acoso", "nom 035", "viaticos", "seguridad", "computo"]):
        return "Ética, viáticos y seguridad"
    return "Otras consultas"


def _is_third_party_query(q_norm: str) -> bool:
    if any(pat in q_norm for pat in THIRD_PARTY_PATTERNS):
        if any(own in q_norm for own in ["me quedan", "mi saldo", "mis vacaciones", "de vacaciones"]):
            if not any(tp in q_norm for tp in ["companero", "companera", "colega", "le quedan a", "otro ", "otra ", "alguien mas"]):
                return False
        return True
    return False


def classify_intent(question: str) -> str:
    q_norm = normalize_text(question)
    if _is_third_party_query(q_norm):
        return "restringida"
    if any(r in q_norm for r in REPORT_SIGNALS):
        return "reporte"

    has_personal = any(p in q_norm for p in PERSONAL_PRONOUNS)
    has_policy = any(p in q_norm for p in POLICY_SIGNALS)

    if has_personal and has_policy:
        return "mixta"
    if has_personal:
        return "dato_personal"
    return "politica"


class AgentState(TypedDict):
    question: str
    q_norm: str
    intent: str
    topic: str
    agent_used: str
    answer: str
    citations: List[Dict[str, Any]]
    tool_figures: List[str]
    outcome: str
    needs_hr_escalation: bool
    validation_attempts: int
    validation_passed: bool


def _build_graph(db: Session, current_user: Employee):
    def classify_node(state: AgentState) -> AgentState:
        q_norm = normalize_text(state["question"])
        state["q_norm"] = q_norm
        state["intent"] = classify_intent(state["question"])
        state["topic"] = _detect_topic(q_norm)
        return state

    def route_by_intent(state: AgentState) -> str:
        return state["intent"]

    def restricted_node(state: AgentState) -> AgentState:
        state["agent_used"] = "Orquestador (Control de Acceso)"
        state["outcome"] = "denegada"
        state["citations"] = []
        state["tool_figures"] = []
        if current_user.role == "rrhh":
            state["answer"] = (
                "Por privacidad y auditoría, el asistente personal solo consulta datos de la sesión autenticada. "
                "Para revisar información agregada o solicitudes del personal, utiliza el Dashboard de RRHH."
            )
        else:
            state["answer"] = (
                "No tengo permiso para consultar ni revelar información personal, saldos o solicitudes de otros "
                "colaboradores. Por políticas de privacidad y control de acceso de Nubera Digital, solo puedes "
                "consultar tus propios registros."
            )
        return state

    def report_node(state: AgentState) -> AgentState:
        state["citations"] = []
        state["tool_figures"] = []
        if current_user.role != "rrhh":
            state["agent_used"] = "Orquestador (Control de Acceso)"
            state["outcome"] = "denegada"
            state["answer"] = (
                "No tienes permisos para consultar reportes ejecutivos ni indicadores agregados de la plantilla. "
                "Esta información es exclusiva del rol de RRHH."
            )
            return state

        state["agent_used"] = "Agente Analista"
        latest = db.query(DailyReport).order_by(DailyReport.report_date.desc()).first()
        if not latest:
            state["answer"] = "No hay reportes diarios guardados aún."
        else:
            state["answer"] = f"Corte {latest.report_date}: {latest.executive_summary}"
            state["tool_figures"] = [str(latest.absences_today), str(latest.pending_requests)]
        state["outcome"] = "resuelta"
        return state

    def employee_node(state: AgentState) -> AgentState:
        state["agent_used"] = "Agente de Datos del Colaborador"
        res = answer_employee_question(db, current_user, state["question"])
        state["answer"] = res["answer"]
        state["citations"] = []
        state["tool_figures"] = res.get("tool_figures", [])
        state["outcome"] = "resuelta"
        return state

    def policy_node(state: AgentState) -> AgentState:
        state["agent_used"] = "Agente de Políticas"
        res = answer_policy_question(db, state["question"])
        state["answer"] = res["answer"]
        state["citations"] = res["citations"]
        state["tool_figures"] = []
        if not res["found"]:
            state["outcome"] = "escalada_rrhh"
            state["needs_hr_escalation"] = True
        else:
            state["outcome"] = "resuelta"
        return state

    def mixed_node(state: AgentState) -> AgentState:
        state["agent_used"] = "Orquestador (Datos del Colaborador + Políticas)"
        emp_res = answer_employee_question(db, current_user, state["question"])
        pol_res = answer_policy_question(db, state["question"])
        state["citations"] = pol_res["citations"]
        state["tool_figures"] = emp_res.get("tool_figures", [])
        if pol_res["found"]:
            state["answer"] = f"{emp_res['answer']}\n\n**Regla aplicable en política:**\n{pol_res['answer']}"
            state["outcome"] = "resuelta"
        else:
            state["answer"] = f"{emp_res['answer']}\n\n{pol_res['answer']}"
            state["outcome"] = "escalada_rrhh"
            state["needs_hr_escalation"] = True
        return state

    def validator_node(state: AgentState) -> AgentState:
        state["validation_attempts"] += 1
        check = validate_response(
            current_user=current_user,
            intent=state["intent"],
            answer=state["answer"],
            citations=state["citations"],
            tool_figures=state["tool_figures"],
            needs_hr_escalation=state["needs_hr_escalation"],
        )
        state["validation_passed"] = check["valid"]
        if not check["valid"] and state["validation_attempts"] >= 2:
            # Tras 2 intentos, devuelve solo información verificable y ofrece escalar
            state["needs_hr_escalation"] = True
            if state["outcome"] == "resuelta":
                state["outcome"] = "escalada_rrhh"
            state["answer"] += (
                "\n\nNota del validador: No fue posible verificar todos los detalles automáticamente; "
                "puedes confirmar la creación de un ticket con RRHH para revisión."
            )
        return state

    def route_after_validation(state: AgentState) -> str:
        if state["validation_passed"] or state["validation_attempts"] >= 2:
            return "done"
        if state["intent"] in ("politica", "mixta"):
            return "retry_policy"
        return "done"

    graph = StateGraph(AgentState)
    graph.add_node("classify", classify_node)
    graph.add_node("restringida", restricted_node)
    graph.add_node("reporte", report_node)
    graph.add_node("dato_personal", employee_node)
    graph.add_node("politica", policy_node)
    graph.add_node("mixta", mixed_node)
    graph.add_node("validator", validator_node)

    graph.set_entry_point("classify")
    graph.add_conditional_edges(
        "classify",
        route_by_intent,
        {
            "restringida": "restringida",
            "reporte": "reporte",
            "dato_personal": "dato_personal",
            "politica": "politica",
            "mixta": "mixta",
        },
    )
    for node_name in ("restringida", "reporte", "dato_personal", "politica", "mixta"):
        graph.add_edge(node_name, "validator")

    graph.add_conditional_edges(
        "validator",
        route_after_validation,
        {
            "done": END,
            "retry_policy": "politica",
        },
    )
    return graph.compile()


def process_chat_query(
    db: Session,
    current_user: Employee,
    question: str,
    session_id: str = "default",
) -> tuple[ChatLog, str | None]:
    start = time.perf_counter()
    trace_id = uuid.uuid4().hex[:16]
    prompt_version = _get_prompt_version()

    # Asegura existencia de la conversación aislada por usuario
    raw_session = session_id or "default"
    conv_id = f"{current_user.id}:{raw_session}"
    conv = db.query(ChatConversation).filter(ChatConversation.id == conv_id).first()
    if not conv:
        conv = ChatConversation(
            id=conv_id,
            employee_id=current_user.id,
            title=question[:60] + ("..." if len(question) > 60 else ""),
        )
        db.add(conv)
        db.flush()

    app_graph = _build_graph(db, current_user)
    final_state: AgentState = app_graph.invoke(
        {
            "question": question,
            "q_norm": "",
            "intent": "politica",
            "topic": "Otras consultas",
            "agent_used": "",
            "answer": "",
            "citations": [],
            "tool_figures": [],
            "outcome": "resuelta",
            "needs_hr_escalation": False,
            "validation_attempts": 0,
            "validation_passed": True,
        }
    )

    latency_ms = max(1, int((time.perf_counter() - start) * 1000))
    suggested_summary = None
    if final_state["needs_hr_escalation"]:
        suggested_summary, _ = build_ticket_summary(question, final_state["topic"], current_user)

    log = ChatLog(
        trace_id=trace_id,
        employee_id=current_user.id,
        session_id=conv_id,
        question=question,
        answer=final_state["answer"],
        intent=final_state["intent"],
        agent_used=final_state["agent_used"],
        prompt_version=prompt_version,
        topic=final_state["topic"],
        citations_json=final_state["citations"],
        latency_ms=latency_ms,
        outcome=final_state["outcome"],
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log, suggested_summary
