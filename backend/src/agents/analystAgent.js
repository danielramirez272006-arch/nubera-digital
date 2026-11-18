import { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { normalizeText } from './embeddings.js';
import { generateChatCompletion } from './llmClient.js';
import { loadPromptText } from './promptLoader.js';
import { todayInTimezone } from '../services/paymentSchedule.js';
import { addDaysUtc, parseIsoDateUtc, toIsoDate } from '../services/vacationRules.js';

export const ABSENCE_TYPES = ['vacaciones', 'permiso_con_goce', 'permiso_sin_goce', 'incapacidad'];

const inFlightReports = new Map();

function toLocalDateStr(dateObj, tz = config.TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dateObj);
}

function toLocalIsoString(dateObj, tz = config.TIMEZONE) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(dateObj)
    .replace(' ', 'T');
  return parts;
}

function formatDmy(d) {
  const iso = toIsoDate(d);
  const [y, m, day] = iso.split('-');
  return `${day}/${m}/${y}`;
}

function formatDm(d) {
  const iso = toIsoDate(d);
  const [, m, day] = iso.split('-');
  return `${day}/${m}`;
}

async function buildExecutiveSummary(metrics) {
  const rDate = metrics.report_date;
  const absences = metrics.absences_today;
  const pending = metrics.pending_requests;
  const over3 = metrics.pending_over_3_days;
  const disabilities = metrics.active_disabilities;
  const resolvedPct = Number(metrics.resolved_without_escalation_pct);
  const turnover = Number(metrics.turnover_rate_pct);
  const over20 = metrics.employees_over_20_vacation_days;
  const chatVol = metrics.prev_day_chat_volume;
  const avgLat = metrics.prev_day_avg_latency_ms;

  const s1 =
    `Al corte del ${rDate}, Nubera Digital registra ${absences} ausencia(s) activa(s) en el día ` +
    `y ${disabilities} incapacidad(es) médica(s) vigente(s).`;
  const s2 =
    `Existen ${pending} solicitud(es) pendiente(s) de atención, de las cuales ${over3} ` +
    'llevan más de tres días sin respuesta y requieren seguimiento prioritario.';
  const s3 =
    `En el asistente de consultas, ayer se atendieron ${chatVol} interacciones con una latencia ` +
    `promedio de ${avgLat} ms y una tasa de resolución sin escalamiento del ${resolvedPct.toFixed(1)}%.`;
  const s4 =
    `En indicadores de plantilla, la rotación mensual se ubica en ${turnover.toFixed(1)}% y ` +
    `${over20} colaborador(es) acumulan más de 20 días de vacaciones disponibles.`;
  const deterministic = `${s1} ${s2} ${s3} ${s4}`;

  const prompt = await loadPromptText(
    'analyst_agent',
    'Eres el Agente Analista de RRHH de Nubera Digital. Redacta un resumen ejecutivo de 3 a 5 frases en español de México usando ÚNICAMENTE las cifras exactas del JSON proporcionado.'
  );

  const llmSummary = await generateChatCompletion({
    systemPrompt: `${prompt}\n\nRedacta de 3 a 5 frases concisas en español de México usando ÚNICAMENTE las cifras exactas del JSON proporcionado.`,
    userPrompt: `Cifras del reporte: ${JSON.stringify(metrics)}`,
    maxTokens: 300,
  });

  const requiredFigures = [
    String(absences),
    String(disabilities),
    String(pending),
    String(over3),
    String(chatVol),
    String(over20),
  ];
  const figuresPreserved =
    Boolean(llmSummary) && requiredFigures.every((fig) => llmSummary.includes(fig));

  return figuresPreserved ? llmSummary : deterministic;
}

export async function generateDailyReport(prisma, targetDateInput = null) {
  const targetDate = targetDateInput
    ? typeof targetDateInput === 'string'
      ? parseIsoDateUtc(targetDateInput)
      : targetDateInput
    : todayInTimezone();

  const targetIso = toIsoDate(targetDate);
  if (inFlightReports.has(targetIso)) {
    return inFlightReports.get(targetIso);
  }

  const runPromise = (async () => {
    try {
      const start30 = addDaysUtc(targetDate, -29);
      const monthStart = parseIsoDateUtc(`${targetIso.slice(0, 8)}01`);
    const prevDayIso = toIsoDate(addDaysUtc(targetDate, -1));

    // Consultas base en paralelo
    const [
      todayLeaves,
      pendingRows,
      approved30,
      allChatsRaw,
      monthDisabilities,
      monthlyHires,
      monthlyExits,
      activeHeadcount,
      over20Balances,
      activeDepts,
    ] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: {
          status: 'aprobada',
          requestType: { in: ABSENCE_TYPES },
          startDate: { lte: targetDate },
          endDate: { gte: targetDate },
        },
        include: {
          employee: { select: { id: true, department: true } },
        },
      }),
      prisma.leaveRequest.findMany({
        where: { status: 'pendiente' },
        include: {
          employee: { select: { fullName: true, department: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.leaveRequest.findMany({
        where: {
          status: 'aprobada',
          requestType: { in: ABSENCE_TYPES },
          endDate: { gte: start30 },
          startDate: { lte: targetDate },
        },
        select: { employeeId: true, startDate: true, endDate: true },
      }),
      prisma.chatLog.findMany({
        select: {
          question: true,
          topic: true,
          outcome: true,
          latencyMs: true,
          createdAt: true,
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          status: 'aprobada',
          requestType: 'incapacidad',
          startDate: { lte: targetDate },
          endDate: { gte: monthStart },
        },
        select: { startDate: true, endDate: true },
      }),
      prisma.employee.count({
        where: {
          hireDate: { gte: monthStart, lte: targetDate },
        },
      }),
      prisma.employee.count({
        where: {
          terminationDate: { gte: monthStart, lte: targetDate },
        },
      }),
      prisma.employee.count({
        where: { status: 'activo' },
      }),
      prisma.balance.findMany({
        where: {
          availableDays: { gt: new Prisma.Decimal('20') },
          employee: { status: 'activo' },
        },
        select: { employeeId: true },
        distinct: ['employeeId'],
      }),
      prisma.employee.findMany({
        where: { status: 'activo' },
        select: { department: true },
        distinct: ['department'],
      }),
    ]);

    // 1. Ausencias del día (excluye home_office y cuenta personas únicas)
    const distinctAbsent = new Set(todayLeaves.map((lr) => lr.employeeId));
    const distinctDisabilities = new Set(
      todayLeaves.filter((lr) => lr.requestType === 'incapacidad').map((lr) => lr.employeeId)
    );
    const absencesToday = distinctAbsent.size;
    const activeDisabilities = distinctDisabilities.size;

    const byTypeMap = new Map();
    const byDeptMap = new Map();
    const todayAbsentRecords = [];

    for (const lr of todayLeaves) {
      const labelRaw = lr.requestType.replace(/_/g, ' ');
      const tLabel = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1);
      const dept = lr.employee?.department || 'Sin departamento';

      if (!byTypeMap.has(tLabel)) byTypeMap.set(tLabel, new Set());
      byTypeMap.get(tLabel).add(lr.employeeId);

      if (!byDeptMap.has(dept)) byDeptMap.set(dept, new Set());
      byDeptMap.get(dept).add(lr.employeeId);

      todayAbsentRecords.push({
        employee_id: lr.employeeId,
        department: dept,
        request_type: tLabel,
        is_disability: lr.requestType === 'incapacidad',
      });
    }

    // 2. Solicitudes pendientes y >3 días
    const pendingList = [];
    let pendingOver3 = 0;
    for (const lr of pendingRows) {
      const createdLocalIso = lr.createdAt ? toLocalDateStr(lr.createdAt) : targetIso;
      if (createdLocalIso > targetIso) continue;
      const createdDateUtc = parseIsoDateUtc(createdLocalIso);
      const daysWaiting = Math.round((targetDate.getTime() - createdDateUtc.getTime()) / 86_400_000);
      const isOver3 = daysWaiting > 3;
      if (isOver3) pendingOver3 += 1;

      const labelRaw = lr.requestType.replace(/_/g, ' ');
      const tLabel = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1);

      pendingList.push({
        id: lr.id,
        employee_name: lr.employee?.fullName || '',
        department: lr.employee?.department || '',
        request_type: tLabel,
        start_date: toIsoDate(lr.startDate),
        end_date: toIsoDate(lr.endDate),
        days_count: Number(lr.daysCount),
        days_waiting: daysWaiting,
        is_over_3_days: isOver3,
      });
    }
    const pendingRequests = pendingList.length;

    // 3. Serie últimos 30 días (excluye home_office)
    const absencesLast30Days = [];
    for (let offset = 0; offset < 30; offset += 1) {
      const d = addDaysUtc(start30, offset);
      const dTime = d.getTime();
      const ids = new Set();
      for (const lr of approved30) {
        if (lr.startDate.getTime() <= dTime && lr.endDate.getTime() >= dTime) {
          ids.add(lr.employeeId);
        }
      }
      absencesLast30Days.push({
        date: toIsoDate(d),
        label: formatDm(d),
        absences: ids.size,
      });
    }

    // 4. Métricas de chat en zona horaria America/Mexico_City
    const chatsUpToCutoff = [];
    for (const c of allChatsRaw) {
      if (!c.createdAt) continue;
      const localDate = toLocalDateStr(c.createdAt);
      if (localDate <= targetIso) {
        chatsUpToCutoff.push({ chat: c, localDate, localIso: toLocalIsoString(c.createdAt) });
      }
    }

    const totalChats = chatsUpToCutoff.length;
    const resolvedChats = chatsUpToCutoff.filter((x) => x.chat.outcome === 'resuelta').length;
    const resolvedPct = totalChats > 0 ? Number(((resolvedChats / totalChats) * 100).toFixed(2)) : 100.0;

    const topicCounts = new Map();
    for (const { chat } of chatsUpToCutoff) {
      topicCounts.set(chat.topic, (topicCounts.get(chat.topic) || 0) + 1);
    }
    const top5Topics = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));

    const prevChats = chatsUpToCutoff.filter((x) => x.localDate === prevDayIso).map((x) => x.chat);
    const prevDayChatVolume = prevChats.length;
    const prevDayAvgLatencyMs =
      prevChats.length > 0
        ? Math.trunc(prevChats.reduce((acc, c) => acc + c.latencyMs, 0) / prevChats.length)
        : 0;

    // Agrupar preguntas equivalentes sin respaldo documental
    const groupedUnanswered = new Map();
    for (const { chat, localIso } of chatsUpToCutoff) {
      if (chat.outcome !== 'escalada_rrhh') continue;
      const normKey = normalizeText(chat.question);
      if (!normKey) continue;
      const cur = groupedUnanswered.get(normKey);
      if (!cur) {
        groupedUnanswered.set(normKey, {
          question: chat.question,
          topic: chat.topic,
          count: 1,
          last_asked_at: localIso,
        });
      } else {
        cur.count += 1;
        if (localIso > cur.last_asked_at) {
          cur.last_asked_at = localIso;
          cur.question = chat.question;
        }
      }
    }
    const unansweredQuestions = [...groupedUnanswered.values()]
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : b.last_asked_at.localeCompare(a.last_asked_at)))
      .slice(0, 15);

    // 5. Días mensuales de incapacidad (soporta solapamiento entre meses)
    let monthlyDisabilityDays = 0;
    const targetMs = targetDate.getTime();
    const monthStartMs = monthStart.getTime();
    for (const lr of monthDisabilities) {
      const effStart = Math.max(lr.startDate.getTime(), monthStartMs);
      const effEnd = Math.min(lr.endDate.getTime(), targetMs);
      if (effEnd >= effStart) {
        monthlyDisabilityDays += Math.round((effEnd - effStart) / 86_400_000) + 1;
      }
    }

    const turnoverRatePct = Number(((monthlyExits / Math.max(1, activeHeadcount)) * 100).toFixed(2));
    const employeesOver20VacationDays = over20Balances.length;
    const departmentsCatalog = activeDepts
      .map((d) => d.department)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'es'));

    const payloadJson = {
      absences_last_30_days: absencesLast30Days,
      top_5_topics: top5Topics,
      absences_by_type: [...byTypeMap.entries()].map(([name, set]) => ({ name, value: set.size })),
      absences_by_department: [...byDeptMap.entries()].map(([department, set]) => ({
        department,
        count: set.size,
      })),
      today_absent_records: todayAbsentRecords,
      departments_catalog: departmentsCatalog,
      pending_requests_list: pendingList,
      unanswered_questions: unansweredQuestions,
      active_headcount: activeHeadcount,
    };

    const summaryInput = {
      report_date: formatDmy(targetDate),
      absences_today: absencesToday,
      pending_requests: pendingRequests,
      pending_over_3_days: pendingOver3,
      active_disabilities: activeDisabilities,
      resolved_without_escalation_pct: resolvedPct,
      turnover_rate_pct: turnoverRatePct,
      employees_over_20_vacation_days: employeesOver20VacationDays,
      prev_day_chat_volume: prevDayChatVolume,
      prev_day_avg_latency_ms: prevDayAvgLatencyMs,
    };
    const executiveSummary = await buildExecutiveSummary(summaryInput);

    const reportData = {
      absencesToday,
      pendingRequests,
      pendingOver3Days: pendingOver3,
      activeDisabilities,
      resolvedWithoutEscalationPct: new Prisma.Decimal(resolvedPct.toFixed(2)),
      monthlyDisabilityDays,
      monthlyHires,
      monthlyExits,
      turnoverRatePct: new Prisma.Decimal(turnoverRatePct.toFixed(2)),
      employeesOver20VacationDays,
      prevDayChatVolume,
      prevDayAvgLatencyMs,
      payloadJson,
      executiveSummary,
      generatedAt: new Date(),
    };

    return await prisma.dailyReport.upsert({
      where: { reportDate: targetDate },
      create: {
        reportDate: targetDate,
        ...reportData,
      },
      update: reportData,
    });
    } finally {
      inFlightReports.delete(targetIso);
    }
  })();

  inFlightReports.set(targetIso, runPromise);
  return runPromise;
}
