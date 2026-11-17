import hashlib
import math
import re
import unicodedata
from typing import List
import numpy as np

from app.config import settings

STOPWORDS_ES = {
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al",
    "a", "en", "con", "por", "para", "sin", "sobre", "entre", "y", "o", "u",
    "que", "cual", "cuales", "como", "cuando", "donde", "cuanto", "cuanta",
    "cuantos", "cuantas", "me", "mi", "mis", "te", "tu", "tus", "su", "sus",
    "se", "nos", "es", "son", "esta", "estan", "estar", "ser", "tengo",
    "tiene", "tienen", "puedo", "puede", "pueden", "hay", "si", "no", "lo",
    "le", "les", "mas", "muy", "ya", "empresa", "nubera", "digital"
}

SYNONYM_GROUPS = {
    "vacaciones": ["vacacion", "vacaciones", "descanso", "feriado", "aniversario", "disfrute", "caducan", "vencen", "proximo ano"],
    "anticipacion": ["anticipacion", "anticipo", "antes", "tiempo", "pedir", "solicitar", "avisar", "habiles"],
    "permiso": ["permiso", "permisos", "licencia", "licencias", "ausencia", "goce", "paternidad", "matrimonio", "duelo", "fallecimiento"],
    "incapacidad": ["incapacidad", "incapacidades", "imss", "enfermedad", "medico", "medica", "maternidad", "certificado", "salud", "riesgo"],
    "pago": ["pago", "pagos", "nomina", "quincena", "sueldo", "salario", "aguinaldo", "vales", "fondo", "ahorro", "prestacion", "prestaciones", "prima", "sgmm"],
    "remoto": ["remoto", "home office", "hibrido", "horario", "entrada", "salida", "oficina", "presencial", "jornada"],
    "evaluacion": ["evaluacion", "desempeno", "okr", "merito", "promocion", "semestral"],
    "capacitacion": ["capacitacion", "certificacion", "certificaciones", "curso", "presupuesto", "aprendizaje"],
    "etica": ["etica", "acoso", "nom 035", "hostigamiento", "discriminacion", "denuncia", "denuncias", "confidencial", "conducta", "falta", "reporta", "reportar", "canal"],
    "feriados": ["feriado", "feriados", "festivo", "festivos", "asueto", "calendario", "inhabil", "oficial"],
    "viaticos": ["viaticos", "viaje", "hospedaje", "alimentos", "cfdi", "reembolso"],
    "seguridad": ["seguridad", "computo", "equipo", "mfa", "cifrado", "laptop"],
}


def normalize_text(text: str) -> str:
    text = text.lower().strip()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def tokenize(text: str) -> List[str]:
    norm = normalize_text(text)
    tokens = [t for t in norm.split() if len(t) > 1 and t not in STOPWORDS_ES]
    expanded = list(tokens)
    for token in tokens:
        for group_key, terms in SYNONYM_GROUPS.items():
            if token in terms or any(token.startswith(t[:5]) and len(t) >= 5 for t in terms):
                expanded.append(f"topic_{group_key}")
    return expanded


def _hash_token(token: str, dim: int) -> tuple[int, float]:
    digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
    val = int.from_bytes(digest, "big")
    idx = val % dim
    sign = 1.0 if ((val >> 8) & 1) == 0 else -1.0
    return idx, sign


def embed_text(text: str) -> List[float]:
    """
    Genera un vector normalizado de dimensión EMBEDDING_DIM (384).
    Combina tokens normalizados, bigramas de palabras y trigramas de caracteres
    para lograr alta precisión en español sin depender de APIs externas en modo demo.
    """
    dim = settings.EMBEDDING_DIM
    vec = np.zeros(dim, dtype=np.float32)
    tokens = tokenize(text)

    for tok in tokens:
        weight = 2.0 if tok.startswith("topic_") else 1.5
        idx, sign = _hash_token(tok, dim)
        vec[idx] += sign * weight

    for i in range(len(tokens) - 1):
        bigram = f"{tokens[i]}_{tokens[i+1]}"
        idx, sign = _hash_token(bigram, dim)
        vec[idx] += sign * 1.2

    norm_str = normalize_text(text)
    for i in range(max(0, len(norm_str) - 3)):
        trigram = norm_str[i:i+4]
        if " " not in trigram:
            idx, sign = _hash_token(f"c_{trigram}", dim)
            vec[idx] += sign * 0.25

    norm = float(np.linalg.norm(vec))
    if norm > 0:
        vec = vec / norm
    return vec.tolist()


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    a = np.asarray(vec_a, dtype=np.float32)
    b = np.asarray(vec_b, dtype=np.float32)
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0.0:
        return 0.0
    return float(np.dot(a, b) / denom)
