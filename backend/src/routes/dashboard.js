import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { validateQuery } from '../middleware/validate.js';
import { requireAuth, requireHrRole } from '../middleware/auth.js';
import { generateDailyReport } from '../agents/analystAgent.js';
import { parseIsoDateUtc, toIsoDate } from '../services/vacationRules.js';

export const dashboardRouter = Router();

const reportDateQuerySchema = z.object({
  report_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha esperado: YYYY-MM-DD')
    .optional(),
});

function serializeReport(r) {
  return {
    report_date: toIsoDate(r.reportDate),
    absences_today: r.absencesToday,
    pending_requests: r.pendingRequests,
    pending_over_3_days: r.pendingOver3Days,
    active_disabilities: r.activeDisabilities,
    resolved_without_escalation_pct: Number(r.resolvedWithoutEscalationPct),
    monthly_disability_days: r.monthlyDisabilityDays,
    monthly_hires: r.monthlyHires,
    monthly_exits: r.monthlyExits,
    turnover_rate_pct: Number(r.turnoverRatePct),
    employees_over_20_vacation_days: r.employeesOver20VacationDays,
    prev_day_chat_volume: r.prevDayChatVolume,
    prev_day_avg_latency_ms: r.prevDayAvgLatencyMs,
    executive_summary: r.executiveSummary,
    payload_json: r.payloadJson,
    generated_at: r.generatedAt,
  };
}

dashboardRouter.get(
  '/dates',
  requireAuth,
  requireHrRole,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.dailyReport.findMany({
      select: { reportDate: true },
      orderBy: { reportDate: 'desc' },
    });
    res.json(rows.map((r) => toIsoDate(r.reportDate)));
  })
);

dashboardRouter.get(
  '/report',
  requireAuth,
  requireHrRole,
  validateQuery(reportDateQuerySchema),
  asyncHandler(async (req, res) => {
    const { report_date } = req.validatedQuery;
    const report = report_date
      ? await prisma.dailyReport.findUnique({ where: { reportDate: parseIsoDateUtc(report_date) } })
      : await prisma.dailyReport.findFirst({ orderBy: { reportDate: 'desc' } });

    if (!report) {
      throw new AppError(404, 'No existe un reporte guardado para la fecha seleccionada.');
    }

    res.json(serializeReport(report));
  })
);

dashboardRouter.post(
  '/report/generate',
  requireAuth,
  requireHrRole,
  validateQuery(reportDateQuerySchema),
  asyncHandler(async (req, res) => {
    const { report_date } = req.validatedQuery;
    const report = await generateDailyReport(prisma, report_date || null);
    res.json(serializeReport(report));
  })
);
