import { cosineSimilarity, embedText, normalizeText, tokenize } from './embeddings.js';
import { generateChatCompletion } from './llmClient.js';
import { loadPromptText } from './promptLoader.js';

export const MIN_RELEVANCE_SCORE = 0.28;

export async function retrievePolicyChunks(prisma, question, topK = 4) {
  const qVec = embedText(question);
  const activeChunks = await prisma.documentChunk.findMany({
    where: { document: { status: 'activo' } },
    select: {
      id: true,
      driveFileId: true,
      policyCode: true,
      title: true,
      section: true,
      version: true,
      effectiveDate: true,
      owner: true,
      driveUrl: true,
      content: true,
      embedding: true,
    },
  });

  const qWords = new Set(tokenize(question).filter((w) => !w.startsWith('topic_') && w.length > 3));
  const scored = [];

  for (const chunk of activeChunks) {
    const emb = Array.isArray(chunk.embedding) ? chunk.embedding : [];
    const score = cosineSimilarity(qVec, emb);
    const cNorm = normalizeText(`${chunk.title} ${chunk.section} ${chunk.content}`);
    const bodyNorm = normalizeText(chunk.content);
    const tsNorm = normalizeText(`${chunk.title} ${chunk.section}`);

    let overlap = 0;
    let bodyOverlap = 0;
    let tsOverlap = 0;
    for (const w of qWords) {
      if (cNorm.includes(w)) overlap += 1;
      if (bodyNorm.includes(w)) bodyOverlap += 1;
      if (tsNorm.includes(w)) tsOverlap += 1;
    }

    const boosted =
      score +
      Math.min(0.25, overlap * 0.05) +
      Math.min(0.24, bodyOverlap * 0.06) +
      Math.min(0.18, tsOverlap * 0.09);
    scored.push({ chunk, score: boosted });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export async function answerPolicyQuestion(prisma, question) {
  const matches = await retrievePolicyChunks(prisma, question, 5);
  const qTokens = new Set(tokenize(question));

  let hasLexicalGrounding = false;
  if (matches.length > 0) {
    const topChunk = matches[0].chunk;
    const chunkTokens = new Set(tokenize(`${topChunk.title} ${topChunk.section} ${topChunk.content}`));
    for (const tok of qTokens) {
      if (chunkTokens.has(tok)) {
        hasLexicalGrounding = true;
        break;
      }
    }
  }

  if (matches.length === 0 || matches[0].score < MIN_RELEVANCE_SCORE || !hasLexicalGrounding) {
    return {
      found: false,
      answer:
        'No se encontró una política aplicable en el repositorio interno de Nubera Digital para ' +
        'responder con certeza a tu consulta. Si lo deseas, puedes confirmar la creación de un ticket ' +
        'para que el equipo de RRHH atienda tu caso directamente.',
      citations: [],
      needs_hr_escalation: true,
    };
  }

  const topScore = matches[0].score;
  const relevant = matches.filter((m) => m.score >= Math.max(MIN_RELEVANCE_SCORE, topScore - 0.18));

  const summaryParts = [];
  const citations = [];
  const seenSections = new Set();

  for (const { chunk, score } of relevant.slice(0, 4)) {
    const key = `${chunk.policyCode}::${chunk.section}`;
    if (!seenSections.has(key)) {
      seenSections.add(key);
      summaryParts.push(chunk.content);
      citations.push({
        drive_file_id: chunk.driveFileId,
        policy_code: chunk.policyCode,
        title: chunk.title,
        section: chunk.section,
        version: chunk.version,
        effective_date: chunk.effectiveDate,
        owner: chunk.owner,
        drive_url: chunk.driveUrl,
        snippet: chunk.content,
        score: Number(score.toFixed(3)),
      });
    }
  }

  const rawContext = summaryParts.join(' ');
  const fallbackSysPrompt =
    'Eres el Agente de Políticas de RRHH de Nubera Digital (México). ' +
    'Responde de forma clara y concisa en español de México usando ÚNICAMENTE la evidencia proporcionada. ' +
    'No inventes cifras ni reglas.';
  const loadedPrompt = await loadPromptText('policy_agent', fallbackSysPrompt);

  const llmAnswer = await generateChatCompletion({
    systemPrompt: `${loadedPrompt}\n\nRegla estricta: responde usando ÚNICAMENTE los fragmentos proporcionados.`,
    userPrompt: `Pregunta: ${question}\n\nFragmentos oficiales:\n${rawContext}`,
  });

  return {
    found: true,
    answer: llmAnswer || rawContext,
    citations,
    needs_hr_escalation: false,
  };
}
