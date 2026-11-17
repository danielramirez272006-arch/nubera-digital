import { config } from '../config.js';
import { addDaysUtc, parseIsoDateUtc, toIsoDate } from './vacationRules.js';

export function todayInTimezone(tz = config.TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return parseIsoDateUtc(formatter.format(new Date()));
}

export async function parseCalendarFromDb(prisma) {
  const chunks = await prisma.documentChunk.findMany({
    where: { document: { status: 'activo' } },
    select: { section: true, content: true },
  });

  const scheduled = [];
  const holidays = new Set();

  for (const c of chunks) {
    const secLow = (c.section || '').toLowerCase();
    if (secLow.includes('pagos 2026')) {
      for (const line of (c.content || '').split('\n')) {
        if (line.toLowerCase().includes('pago semanal')) {
          const m = line.match(/\b(202\d-\d{2}-\d{2})\b/);
          if (m) {
            const status = line.toLowerCase().includes('confirmado') ? 'Confirmado' : 'Programado';
            scheduled.push({ dateIso: m[1], date: parseIsoDateUtc(m[1]), status });
          }
        }
      }
    } else if (secLow.includes('feriados 2026')) {
      for (const line of (c.content || '').split('\n')) {
        const m = line.match(/\b(202\d-\d{2}-\d{2})\b/);
        if (m) holidays.add(m[1]);
      }
    }
  }

  scheduled.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  return { scheduled, holidays };
}

export async function getNextPaymentInfo(prisma, refDate = null) {
  const ref = refDate || todayInTimezone();
  const refIso = toIsoDate(ref);
  const { scheduled, holidays } = await parseCalendarFromDb(prisma);

  let scheduledDate = null;
  let calStatus = 'Programado';

  for (const item of scheduled) {
    if (item.dateIso >= refIso) {
      scheduledDate = item.date;
      calStatus = item.status;
      break;
    }
  }

  if (!scheduledDate) {
    // Viernes = 5 en JS getUTCDay()
    const daysUntilFriday = (5 - ref.getUTCDay() + 7) % 7;
    scheduledDate = addDaysUtc(ref, daysUntilFriday);
  }

  let projectedDate = new Date(scheduledDate.getTime());
  let isAdvanced = false;
  while (holidays.has(toIsoDate(projectedDate)) || projectedDate.getUTCDay() === 0 || projectedDate.getUTCDay() === 6) {
    projectedDate = addDaysUtc(projectedDate, -1);
    isAdvanced = true;
  }

  return {
    scheduledDate,
    effectiveDate: calStatus === 'Confirmado' ? projectedDate : null,
    projectedDate,
    isAdvanced,
    status:
      calStatus === 'Confirmado'
        ? 'Confirmado por Nómina'
        : 'Programado (fecha efectiva pendiente de validación por Nómina)',
    source: 'RH-05 Política salarial y calendario de pagos / RH-12 Pagos 2026',
  };
}
