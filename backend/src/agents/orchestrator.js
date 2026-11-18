import crypto from 'node:crypto';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { normalizeText, tokenize } from './embeddings.js';
import { answerPolicyQuestion, MIN_RELEVANCE_SCORE, retrievePolicyChunks } from './policyAgent.js';
import { answerEmployeeQuestion } from './employeeAgent.js';
import { validateResponse } from './validatorAgent.js';
import { buildTicketSummary } from './escalationAgent.js';
import { generateChatCompletion } from './llmClient.js';
import { getPromptVersion, loadPromptText } from './promptLoader.js';

const THIRD_PARTY_PATTERNS = [
  'companero', 'companera', 'colega', 'otro colaborador', 'otra colaboradora',
  'otro empleado', 'otra empleada', 'le quedan a', 'tiene mi ', 'vacaciones de ',
  'saldo de ', 'sueldo de ', 'salario de ', 'incapacidad de ', 'incapacidades de ',
  'alguien mas', 'tercero', 'terceros', 'mi equipo',
];

const PERSONAL_PRONOUNS = [
  'me quedan', 'cuantos dias tengo', 'que saldo tengo', 'vacaciones tengo',
  'mi saldo', 'mis vacaciones', 'mis dias',
  'mis solicitudes', 'mi solicitud', 'mi puesto', 'mi departamento',
  'mi ingreso', 'mi antiguedad', 'mi salario', 'mi sueldo', 'mi lider',
  'me corresponde', 'me faltan', 'cuantos dias me', 'cuando entre',
  'mi proximo pago', 'proxima fecha de pago', 'mi evaluacion', 'proxima evaluacion',
  'mis incapacidades',
];

const POLICY_SIGNALS = [
  'puedo usarlos', 'proximo ano', 'siguiente ano', 'caducan', 'vencen',
  'anticipacion', 'cuanto tiempo antes', 'politica', 'regla', 'norma',
  'como pido', 'como solicito', 'requisitos', 'cuantos dias dan',
  'prima vacacional', 'prima interna', 'aguinaldo', 'vales', 'fondo de ahorro', 'imss',
  'maternidad', 'paternidad', 'matrimonio', 'fallecimiento', 'incapacidad',
  'home office', 'remoto', 'horario', 'quincena', 'pago', 'bono', 'mascotas',
  'sgmm', 'seguro', 'licencia', 'permiso', 'capacitacion', 'certificacion',
  'etica', 'acoso', 'nom 035', 'viaticos', 'hospedaje', 'equipo de computo',
];

const REPORT_SIGNALS = [
  'reporte diario', 'tasa de rotacion', 'ausencias de hoy', 'resumen ejecutivo',
  'indicadores de rrhh', 'solicitudes pendientes del mes',
];

function detectTopic(qNorm) {
  if (['vacacion', 'prima vacacional', 'proximo ano', 'anticipacion'].some((k) => qNorm.includes(k))) {
    return 'Vacaciones';
  }
  if (['permiso', 'licencia', 'paternidad', 'matrimonio', 'duelo', 'fallecimiento'].some((k) => qNorm.includes(k))) {
    return 'Permisos';
  }
  if (['incapacidad', 'imss', 'enfermedad', 'maternidad', 'salud', 'riesgo'].some((k) => qNorm.includes(k))) {
    return 'Incapacidades';
  }
  if (['pago', 'nomina', 'quincena', 'aguinaldo', 'vales', 'fondo', 'sueldo', 'salario', 'sgmm'].some((k) => qNorm.includes(k))) {
    return 'Pagos y prestaciones';
  }
  if (['remoto', 'home office', 'hibrido', 'horario'].some((k) => qNorm.includes(k))) {
    return 'Trabajo remoto';
  }
  if (['evaluacion', 'desempeno', 'capacitacion', 'certificacion'].some((k) => qNorm.includes(k))) {
    return 'Desarrollo y desempeño';
  }
  if (['etica', 'acoso', 'nom 035', 'viaticos', 'seguridad', 'computo'].some((k) => qNorm.includes(k))) {
    return 'Ética, viáticos y seguridad';
  }
  return 'Otras consultas';
}

const AMBIGUOUS_BALANCE_PATTERNS = new Set(['vacaciones de ', 'saldo de ']);

function isThirdPartyQuery(qNorm) {
  if (['system prompt', 'ignora las instrucciones', 'otorga permisos', 'revela todos los salarios'].some((k) => qNorm.includes(k))) {
    return true;
  }
  const strictMatch = THIRD_PARTY_PATTERNS.some(
    (pat) => !AMBIGUOUS_BALANCE_PATTERNS.has(pat) && qNorm.includes(pat)
  );
  if (strictMatch) {
    return true;
  }
  if ([...AMBIGUOUS_BALANCE_PATTERNS].some((pat) => qNorm.includes(pat))) {
    const isOwnVacation =
      qNorm.includes('saldo de vacaciones') ||
      ['me quedan', 'mi saldo', 'mis vacaciones', 'de vacaciones'].some((own) => qNorm.includes(own));
    return !isOwnVacation;
  }
  return false;
}

export function classifyIntent(question) {
  const qNorm = normalizeText(question);
  if (isThirdPartyQuery(qNorm)) return 'restringida';
  if (REPORT_SIGNALS.some((r) => qNorm.includes(r))) return 'reporte';

  const hasPersonal = PERSONAL_PRONOUNS.some((p) => qNorm.includes(p));
  const qForPolicy = qNorm.replace('mi proximo pago', '').replace('proxima fecha de pago', '');
  const hasPolicy = POLICY_SIGNALS.some((p) => qForPolicy.includes(p));

  if (hasPersonal && hasPolicy) return 'mixta';
  if (hasPersonal) return 'dato_personal';
  return 'politica';
}

const AgentState = Annotation.Root({
  question: Annotation(),
  effectiveQuestion: Annotation(),
  history: Annotation(),
  qNorm: Annotation(),
  intent: Annotation(),
  topic: Annotation(),
  agentUsed: Annotation(),
  answer: Annotation(),
  citations: Annotation(),
  toolFigures: Annotation(),
  outcome: Annotation(),
  needsHrEscalation: Annotation(),
  validationAttempts: Annotation(),
  validationPassed: Annotation(),
});

function buildOrchestratorGraph(prisma, currentUser) {
  async function classifyNode(state) {
    const rawNorm = normalizeText(state.question);
    const words = rawNorm.split(' ').filter(Boolean);
    const hasExplicitSignal =
      isThirdPartyQuery(rawNorm) ||
      REPORT_SIGNALS.some((r) => rawNorm.includes(r)) ||
      PERSONAL_PRONOUNS.some((p) => rawNorm.includes(p)) ||
      POLICY_SIGNALS.some((p) => rawNorm.includes(p));

    const prevTurns = Array.isArray(state.history) ? state.history : [];
    const lastUserTurn = [...prevTurns].reverse().find((m) => m.role === 'user');
    const effectiveQuestion =
      !hasExplicitSignal && words.length <= 5 && lastUserTurn?.content
        ? `${lastUserTurn.content} ${state.question}`
        : state.question;

    const qNorm = normalizeText(effectiveQuestion);
    return {
      effectiveQuestion,
      qNorm,
      intent: classifyIntent(effectiveQuestion),
      topic: detectTopic(qNorm),
    };
  }

  function routeByIntent(state) {
    return state.intent;
  }

  async function restrictedNode() {
    const answer =
      currentUser.role === 'rrhh'
        ? 'Por privacidad y auditoría, el asistente personal solo consulta datos de la sesión autenticada. ' +
          'Para revisar información agregada o solicitudes del personal, utiliza el Dashboard de RRHH.'
        : 'No tengo permiso para consultar ni revelar información personal, saldos o solicitudes de otros ' +
          'colaboradores. Por políticas de privacidad y control de acceso de Nubera Digital, solo puedes ' +
          'consultar tus propios registros.';

    return {
      agentUsed: 'Orquestador (Control de Acceso)',
      outcome: 'denegada',
      citations: [],
      toolFigures: [],
      needsHrEscalation: false,
      answer,
    };
  }

  async function reportNode() {
    if (currentUser.role !== 'rrhh') {
      return {
        agentUsed: 'Orquestador (Control de Acceso)',
        outcome: 'denegada',
        citations: [],
        toolFigures: [],
        needsHrEscalation: false,
        answer:
          'No tienes permisos para consultar reportes ejecutivos ni indicadores agregados de la plantilla. ' +
          'Esta información es exclusiva del rol de RRHH.',
      };
    }

    const latest = await prisma.dailyReport.findFirst({
      orderBy: { reportDate: 'desc' },
    });

    if (!latest) {
      return {
        agentUsed: 'Agente Analista',
        outcome: 'resuelta',
        citations: [],
        toolFigures: [],
        needsHrEscalation: false,
        answer: 'No hay reportes diarios guardados aún.',
      };
    }

    const dateStr = latest.reportDate instanceof Date ? latest.reportDate.toISOString().slice(0, 10) : String(latest.reportDate);
    return {
      agentUsed: 'Agente Analista',
      outcome: 'resuelta',
      citations: [],
      toolFigures: [String(latest.absencesToday), String(latest.pendingRequests)],
      needsHrEscalation: false,
      answer: `Corte ${dateStr}: ${latest.executiveSummary}`,
    };
  }

  async function employeeNode(state) {
    const res = await answerEmployeeQuestion(prisma, currentUser, state.effectiveQuestion || state.question);
    return {
      agentUsed: 'Agente de Datos del Colaborador',
      answer: res.answer,
      citations: [],
      toolFigures: res.tool_figures || [],
      outcome: 'resuelta',
      needsHrEscalation: false,
    };
  }

  async function policyNode(state) {
    const res = await answerPolicyQuestion(prisma, state.question, {
      history: state.history || [],
      retrievalQuery: state.effectiveQuestion || state.question,
    });
    return {
      agentUsed: 'Agente de Políticas',
      answer: res.answer,
      citations: res.citations,
      toolFigures: [],
      outcome: res.found ? 'resuelta' : 'escalada_rrhh',
      needsHrEscalation: !res.found,
    };
  }

  async function mixedNode(state) {
    const effectiveQ = state.effectiveQuestion || state.question;
    const [empRes, matches, orchPrompt] = await Promise.all([
      answerEmployeeQuestion(prisma, currentUser, effectiveQ),
      retrievePolicyChunks(prisma, effectiveQ, 3),
      loadPromptText(
        'orchestrator',
        'Eres el Orquestador de RRHH de Nubera Digital. Integra en una sola respuesta clara y coherente los datos personales autorizados y las reglas oficiales.'
      ),
    ]);

    const toolFigures = empRes.tool_figures || [];
    const qTokens = new Set(tokenize(effectiveQ));
    const topChunk = matches[0]?.chunk;
    const topTokens = topChunk
      ? new Set(tokenize(`${topChunk.title} ${topChunk.section} ${topChunk.content}`))
      : new Set();
    const hasLexicalGrounding = [...qTokens].some((tok) => topTokens.has(tok));

    if (matches.length > 0 && matches[0].score >= MIN_RELEVANCE_SCORE && hasLexicalGrounding) {
      const citations = [];
      const snippets = [];
      const seen = new Set();

      for (const { chunk, score } of matches.slice(0, 2)) {
        const key = `${chunk.policyCode}::${chunk.section}`;
        if (!seen.has(key)) {
          seen.add(key);
          snippets.push(`[${chunk.policyCode} · ${chunk.section}] ${chunk.content}`);
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

      const contextTxt = snippets.join('\n');
      const expiredDirective = empRes.is_deadline_expired
        ? ` ATENCIÓN OBLIGATORIA: Al ${empRes.today_str} (America/Mexico_City), el plazo de 6 meses (${empRes.deadline_str}) YA VENCIÓ. ` +
          'No afirmes que puede usarlos el próximo año, no sugieras pedir antes de una fecha pasada y no garantices prórroga ni ampliación; explica que el plazo venció y deriva a Operaciones de RRHH.'
        : '';

      const integrated = await generateChatCompletion({
        systemPrompt:
          `${orchPrompt}\n\n` +
          'Integra en una sola respuesta clara y coherente los datos personales autorizados del colaborador ' +
          'y las reglas de las políticas oficiales. Conserva exactamente todas las cifras personales proporcionadas y no te contradigas.' +
          expiredDirective,
        userPrompt:
          `Pregunta: ${state.question}\n\n` +
          `Datos personales autorizados:\n${empRes.answer}\n\n` +
          `Fragmentos de políticas:\n${contextTxt}`,
        history: state.history || [],
        maxTokens: 450,
      });

      const hasAllFigures = integrated && toolFigures.every((fig) => !fig || integrated.includes(fig));
      const falsePromiseOnExpired =
        empRes.is_deadline_expired &&
        integrated &&
        /(sí\s+(es\s+posible|puedes\s+usarlos)|antes\s+del\s+\d{2}\/\d{2}\/2026)/i.test(integrated);

      const answer =
        hasAllFigures && !falsePromiseOnExpired
          ? integrated
          : `${empRes.answer}\n\n**Regla aplicable en política:**\n${matches[0].chunk.content}`;

      return {
        agentUsed: 'Orquestador (Datos del Colaborador + Políticas)',
        citations,
        toolFigures,
        answer,
        outcome: 'resuelta',
        needsHrEscalation: Boolean(empRes.is_deadline_expired),
      };
    }

    return {
      agentUsed: 'Orquestador (Datos del Colaborador + Políticas)',
      citations: [],
      toolFigures,
      answer:
        `${empRes.answer}\n\n` +
        'Respecto a la regla general consultada, no se encontró un fragmento suficiente en el repositorio ' +
        'para confirmarla; puedes crear un ticket con RRHH para aclaración.',
      outcome: 'escalada_rrhh',
      needsHrEscalation: true,
    };
  }

  async function validatorNode(state) {
    const nextAttempt = (state.validationAttempts || 0) + 1;
    const check = validateResponse({
      intent: state.intent,
      answer: state.answer,
      citations: state.citations || [],
      toolFigures: state.toolFigures || [],
      needsHrEscalation: Boolean(state.needsHrEscalation),
    });

    if (!check.valid && nextAttempt >= 2) {
      let fallbackAnswer =
        `${state.answer}\n\nNota del validador: No fue posible verificar todos los detalles automáticamente; ` +
        'puedes confirmar la creación de un ticket con RRHH para revisión.';

      if (state.intent === 'mixta') {
        const empOnly = await answerEmployeeQuestion(prisma, currentUser, state.question);
        fallbackAnswer =
          `${empOnly.answer}\n\n` +
          'No fue posible validar automáticamente la parte normativa; puedes confirmar la creación de un ticket con RRHH.';
      }

      return {
        validationAttempts: nextAttempt,
        validationPassed: false,
        needsHrEscalation: true,
        outcome: state.outcome === 'resuelta' ? 'escalada_rrhh' : state.outcome,
        answer: fallbackAnswer,
      };
    }

    return {
      validationAttempts: nextAttempt,
      validationPassed: check.valid,
    };
  }

  function routeAfterValidation(state) {
    if (state.validationPassed || state.validationAttempts >= 2) return 'done';
    if (state.intent === 'mixta') return 'retry_mixed';
    if (state.intent === 'politica') return 'retry_policy';
    return 'done';
  }

  return new StateGraph(AgentState)
    .addNode('classify', classifyNode)
    .addNode('restringida', restrictedNode)
    .addNode('reporte', reportNode)
    .addNode('dato_personal', employeeNode)
    .addNode('politica', policyNode)
    .addNode('mixta', mixedNode)
    .addNode('validator', validatorNode)
    .addEdge(START, 'classify')
    .addConditionalEdges('classify', routeByIntent, {
      restringida: 'restringida',
      reporte: 'reporte',
      dato_personal: 'dato_personal',
      politica: 'politica',
      mixta: 'mixta',
    })
    .addEdge('restringida', 'validator')
    .addEdge('reporte', 'validator')
    .addEdge('dato_personal', 'validator')
    .addEdge('politica', 'validator')
    .addEdge('mixta', 'validator')
    .addConditionalEdges('validator', routeAfterValidation, {
      done: END,
      retry_policy: 'politica',
      retry_mixed: 'mixta',
    })
    .compile();
}

export async function processChatQuery(prisma, currentUser, question, sessionId = 'default') {
  const startNs = process.hrtime.bigint();
  const traceId = crypto.randomBytes(8).toString('hex');
  const promptVersion = await getPromptVersion('orchestrator');

  const rawSession = sessionId || 'default';
  const convId = `${currentUser.id}:${rawSession}`;
  const title = question.length > 60 ? `${question.slice(0, 60)}...` : question;

  await prisma.chatConversation.upsert({
    where: { id: convId },
    create: {
      id: convId,
      employeeId: currentUser.id,
      title,
    },
    update: {},
  });

  const previousLogs = await prisma.chatLog.findMany({
    where: {
      sessionId: convId,
      employeeId: currentUser.id,
      outcome: { not: 'denegada' },
    },
    orderBy: { id: 'desc' },
    take: 4,
    select: { question: true, answer: true },
  });
  const history = previousLogs
    .reverse()
    .flatMap((l) => [
      { role: 'user', content: l.question },
      { role: 'assistant', content: l.answer },
    ]);

  const graph = buildOrchestratorGraph(prisma, currentUser);
  const finalState = await graph.invoke({
    question,
    effectiveQuestion: question,
    history,
    qNorm: '',
    intent: 'politica',
    topic: 'Otras consultas',
    agentUsed: '',
    answer: '',
    citations: [],
    toolFigures: [],
    outcome: 'resuelta',
    needsHrEscalation: false,
    validationAttempts: 0,
    validationPassed: true,
  });

  const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
  const latencyMs = Math.max(1, Math.round(elapsedMs));

  let suggestedSummary = null;
  if (finalState.needsHrEscalation) {
    suggestedSummary = buildTicketSummary(question, finalState.topic, currentUser).summary;
  }

  const log = await prisma.chatLog.create({
    data: {
      traceId,
      employeeId: currentUser.id,
      sessionId: convId,
      question,
      answer: finalState.answer,
      intent: finalState.intent,
      agentUsed: finalState.agentUsed,
      promptVersion,
      topic: finalState.topic,
      citationsJson: finalState.citations || [],
      latencyMs,
      outcome: finalState.outcome,
    },
  });

  return { log, suggestedSummary };
}
