import cron from 'node-cron';
import { config } from '../config.js';
import { syncDrivePolicies } from '../agents/ingestionAgent.js';
import { generateDailyReport } from '../agents/analystAgent.js';

const scheduledTasks = [];

export function startSchedulers(prisma) {
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
