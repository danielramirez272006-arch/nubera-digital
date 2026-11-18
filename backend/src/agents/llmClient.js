import { config } from '../config.js';

/**
 * Cliente LLM unificado (DeepSeek / OpenAI / Gemini).
 * Retorna null si no hay API key configurada o si ocurre un error,
 * permitiendo respaldo determinista sin interrumpir el portal.
 */
export async function generateChatCompletion({ systemPrompt, userPrompt, history = [], maxTokens = 450 }) {
  const provider = (config.LLM_PROVIDER || 'none').toLowerCase();
  const safeHistory = Array.isArray(history)
    ? history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content.slice(0, 800) }))
    : [];

  if (provider === 'deepseek' && config.DEEPSEEK_API_KEY) {
    const url = `${config.DEEPSEEK_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.LLM_MODEL || 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            ...safeHistory,
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data?.choices?.[0]?.message?.content?.trim() || null;
      }
    } catch {
      return null;
    }
  }

  if (provider === 'openai' && config.OPENAI_API_KEY) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.LLM_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...safeHistory,
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data?.choices?.[0]?.message?.content?.trim() || null;
      }
    } catch {
      return null;
    }
  }

  if (provider === 'gemini' && config.GEMINI_API_KEY) {
    const model = config.LLM_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.GEMINI_API_KEY}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
      }
    } catch {
      return null;
    }
  }

  return null;
}
