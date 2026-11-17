from typing import List, Tuple, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.models import DocumentChunk, DriveDocument
from app.agents.embeddings import embed_text, cosine_similarity, normalize_text, tokenize
from app.agents.llm_client import generate_chat_completion


MIN_RELEVANCE_SCORE = 0.28


def retrieve_policy_chunks(db: Session, question: str, top_k: int = 3) -> List[Tuple[DocumentChunk, float]]:
    q_vec = embed_text(question)

    if settings.is_postgres:
        vec_literal = "[" + ",".join(f"{x:.6f}" for x in q_vec) + "]"
        rows = db.execute(
            text(
                """
                SELECT dc.id, 1 - (dc.embedding <=> CAST(:qvec AS vector)) AS score
                FROM document_chunks dc
                JOIN drive_documents dd ON dd.id = dc.document_id
                WHERE dd.status = 'activo'
                ORDER BY dc.embedding <=> CAST(:qvec AS vector)
                LIMIT :limit
                """
            ),
            {"qvec": vec_literal, "limit": top_k},
        ).fetchall()
        results: List[Tuple[DocumentChunk, float]] = []
        for chunk_id, score in rows:
            chunk = db.query(DocumentChunk).filter(DocumentChunk.id == chunk_id).first()
            if chunk:
                results.append((chunk, float(score)))
        return results

    active_chunks = (
        db.query(DocumentChunk)
        .join(DriveDocument, DriveDocument.id == DocumentChunk.document_id)
        .filter(DriveDocument.status == "activo")
        .all()
    )
    scored: List[Tuple[DocumentChunk, float]] = []
    q_norm = normalize_text(question)
    q_words = set(w for w in q_norm.split() if len(w) > 3)

    for chunk in active_chunks:
        score = cosine_similarity(q_vec, chunk.embedding)
        c_norm = normalize_text(f"{chunk.title} {chunk.section} {chunk.content}")
        overlap = sum(1 for w in q_words if w in c_norm)
        boosted = score + min(0.12, overlap * 0.03)
        scored.append((chunk, boosted))

    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[:top_k]


def answer_policy_question(db: Session, question: str) -> Dict[str, Any]:
    matches = retrieve_policy_chunks(db, question, top_k=3)
    q_tokens = set(tokenize(question))

    has_lexical_grounding = False
    if matches:
        top_chunk = matches[0][0]
        chunk_tokens = set(tokenize(f"{top_chunk.title} {top_chunk.section} {top_chunk.content}"))
        has_lexical_grounding = len(q_tokens.intersection(chunk_tokens)) > 0

    if not matches or matches[0][1] < MIN_RELEVANCE_SCORE or not has_lexical_grounding:
        return {
            "found": False,
            "answer": (
                "No se encontró una política aplicable en el repositorio interno de Nubera Digital para "
                "responder con certeza a tu consulta. Si lo deseas, puedes confirmar la creación de un ticket "
                "para que el equipo de RRHH atienda tu caso directamente."
            ),
            "citations": [],
            "needs_hr_escalation": True,
        }

    top_chunk, top_score = matches[0]
    relevant = [item for item in matches if item[1] >= max(MIN_RELEVANCE_SCORE, top_score - 0.14)]

    summary_parts = []
    citations = []
    seen_sections = set()

    for chunk, score in relevant[:2]:
        key = (chunk.policy_code, chunk.section)
        if key not in seen_sections:
            seen_sections.add(key)
            summary_parts.append(chunk.content)
            citations.append(
                {
                    "drive_file_id": chunk.drive_file_id,
                    "policy_code": chunk.policy_code,
                    "title": chunk.title,
                    "section": chunk.section,
                    "version": chunk.version,
                    "effective_date": chunk.effective_date,
                    "owner": chunk.owner,
                    "drive_url": chunk.drive_url,
                    "snippet": chunk.content,
                    "score": round(float(score), 3),
                }
            )

    raw_context = " ".join(summary_parts)
    llm_answer = generate_chat_completion(
        system_prompt=(
            "Eres el Agente de Políticas de RRHH de Nubera Digital (México). "
            "Responde de forma clara y concisa en español de México usando ÚNICAMENTE la evidencia proporcionada. "
            "No inventes cifras ni reglas."
        ),
        user_prompt=f"Pregunta: {question}\n\nFragmentos oficiales:\n{raw_context}",
    )

    return {
        "found": True,
        "answer": llm_answer or raw_context,
        "citations": citations,
        "needs_hr_escalation": False,
    }
