import cron from 'node-cron';
import { config } from '../config.js';
import { syncDrivePolicies } from '../agents/ingestionAgent.js';
import { generateDailyReport } from '../agents/analystAgent.js';
import { parseIsoDateUtc } from './vacationRules.js';

const scheduledTasks = [];

function getNowPartsInTimezone(tz = config.TIMEZONE, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    dateStr: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

/**
 * Recupera ejecuciones programadas pendientes del día actual en `America/Mexico_City`
 * cuando el servicio estuvo apagado a la hora configurada (6:30 a. m. ingesta / 7:00 a. m. reporte).
 */
export async function recoverMissedRuns(prisma, now = new Date()) {
  const { dateStr, hour, minute } = getNowPartsInTimezone(config.TIMEZONE, now);
  const currentMinutes = hour * 60 + minute;
  const ingestionMinutes = config.INGESTION_CRON_HOUR * 60 + config.INGESTION_CRON_MINUTE;
  const analystMinutes = config.ANALYST_CRON_HOUR * 60 + config.ANALYST_CRON_MINUTE;

  const recovered = { ingestion: false, report: false, date: dateStr };

  if (currentMinutes >= ingestionMinutes && config.GOOGLE_DRIVE_ENABLED) {
    const latestDoc = await prisma.driveDocument.findFirst({
      where: { status: 'activo' },
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    });
    const lastSyncDate = latestDoc?.lastSyncedAt
      ? getNowPartsInTimezone(config.TIMEZONE, latestDoc.lastSyncedAt).dateStr
      : null;

    if (lastSyncDate !== dateStr) {
      await syncDrivePolicies(prisma);
      recovered.ingestion = true;
    }
  }

  if (currentMinutes >= analystMinutes) {
    const todayDate = parseIsoDateUtc(dateStr);
    const existingReport = await prisma.dailyReport.findUnique({
      where: { reportDate: todayDate },
      select: { id: true },
    });
    if (!existingReport) {
      await generateDailyReport(prisma, dateStr);
      recovered.report = true;
    }
  }

  return recovered;
}

export function startSchedulers(prisma, { runCatchUp = true } = {}) {
  if (scheduledTasks.length > 0) return scheduledTasks;

  const ingestionExpr = `${config.INGESTION_CRON_MINUTE} ${config.INGESTION_CRON_HOUR} * * *`;
  const analystExpr = `${config.ANALYST_CRON_MINUTE} ${config.ANALYST_CRON_HOUR} * * *`;

  const ingestionJob = cron.schedule(
    ingestionExpr,
    async () => {
      try {
        await syncDrivePolicies(prisma);
      } catch (err) {
        console.error('[scheduler] Error en ingesta programada de Drive:', err.message);
      }
    },
    { timezone: config.TIMEZONE }
  );

  const analystJob = cron.schedule(
    analystExpr,
    async () => {
      try {
        await generateDailyReport(prisma);
      } catch (err) {
        console.error('[scheduler] Error en generación programada de reporte diario:', err.message);
      }
    },
    { timezone: config.TIMEZONE }
  );

  scheduledTasks.push(ingestionJob, analystJob);

  if (runCatchUp) {
    recoverMissedRuns(prisma).catch((err) => {
      console.error('[scheduler] Error en recuperación de ejecuciones pendientes:', err.message);
    });
  }

  return scheduledTasks;
}

export function stopSchedulers() {
  while (scheduledTasks.length > 0) {
    const task = scheduledTasks.pop();
    try {
      task.stop();
    } catch {
      // ignore stop errors
    }
  }
}
