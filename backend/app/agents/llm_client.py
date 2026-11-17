import httpx
from app.config import settings


def generate_chat_completion(system_prompt: str, user_prompt: str, max_tokens: int = 450) -> str | None:
    """
    Cliente LLM unificado (DeepSeek / OpenAI / Gemini).
    Retorna None si no hay API key configurada o si ocurre un error,
    permitiendo respaldo determinista sin interrumpir el portal.
    """
    provider = (settings.LLM_PROVIDER or "none").lower()

    if provider == "deepseek" and settings.DEEPSEEK_API_KEY:
        url = f"{settings.DEEPSEEK_BASE_URL.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.LLM_MODEL or "deepseek-chat",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.1,
            "max_tokens": max_tokens,
        }
        try:
            resp = httpx.post(url, headers=headers, json=payload, timeout=12.0)
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"].strip()
        except Exception:
            return None

    if provider == "openai" and settings.OPENAI_API_KEY:
        headers = {
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.LLM_MODEL or "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.1,
            "max_tokens": max_tokens,
        }
        try:
            resp = httpx.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=12.0)
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"].strip()
        except Exception:
            return None

    return None
