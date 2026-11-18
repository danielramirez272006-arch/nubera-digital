import { Router } from 'express';
import { prisma as defaultPrisma } from '../db/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { createRequireAuth } from '../middleware/auth.js';
import { serializeUserSession } from './auth.js';
import { computeVacationEntitlement, toIsoDate } from '../services/vacationRules.js';
import { getNextPaymentInfo, todayInTimezone } from '../services/paymentSchedule.js';

export function createMeRouter(prisma = defaultPrisma) {
  const meRouter = Router();
  const requireAuth = createRequireAuth(prisma);

  meRouter.get(
  '/data',
  requireAuth,
  asyncHandler(async (req, res) => {
    const todayMx = todayInTimezone();
    const [balances, requests, disabilities, payInfo] = await Promise.all([
      prisma.balance.findMany({
        where: { employeeId: req.user.id },
        orderBy: { year: 'desc' },
      }),
      prisma.leaveRequest.findMany({
        where: { employeeId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      prisma.disability.findMany({
        where: { employeeId: req.user.id },
        orderBy: { startDate: 'desc' },
        take: 10,
      }),
      getNextPaymentInfo(prisma, todayMx),
    ]);

    const vacInfo = computeVacationEntitlement(req.user.hireDate, todayMx);
    const userOut = serializeUserSession(req.user, payInfo.projectedDate);

    res.json({
      employee: userOut,
      balances: balances.map((b) => {
        const avail = Number(b.availableDays);
        const expired = vacInfo.isDeadlineExpired && avail > 0;
        return {
          year: b.year,
          entitled_days: Number(b.entitledDays),
          used_days: Number(b.usedDays),
          pending_days: Number(b.pendingDays),
          available_days: avail,
          expiration_date: toIsoDate(b.expirationDate),
          years_of_service: vacInfo.yearsOfService,
          period_start: toIsoDate(vacInfo.periodStart),
          period_end: toIsoDate(vacInfo.periodEnd),
          anniversary_date: toIsoDate(vacInfo.anniversaryDate),
          next_anniversary_date: toIsoDate(vacInfo.nextAnniversaryDate),
          six_month_deadline: toIsoDate(vacInfo.sixMonthDeadline),
          is_deadline_expired: expired,
          requires_hr_scheduling: expired,
          origin_note: expired
            ? `Tabla RH-01 (${vacInfo.yearsOfService} años). Plazo de 6 meses vencido el ${toIsoDate(vacInfo.sixMonthDeadline)}; Operaciones de RRHH revisa y agenda el saldo pendiente.`
            : `Tabla RH-01 (${vacInfo.yearsOfService} años cumplidos). Las solicitudes pendientes reservan saldo.`,
        };
      }),
      recent_requests: requests.map((r) => ({
        id: r.id,
        employee_name: req.user.fullName,
        department: req.user.department,
        request_type: r.requestType,
        start_date: toIsoDate(r.startDate),
        end_date: toIsoDate(r.endDate),
        days_count: Number(r.daysCount),
        status: r.status,
        reason: r.reason,
        approver_notes: r.approverNotes,
        created_at: r.createdAt,
      })),
      disabilities: disabilities.map((d) => ({
        id: d.id,
        folio_imss: d.folioImss,
        disability_type: d.disabilityType,
        start_date: toIsoDate(d.startDate),
        end_date: toIsoDate(d.endDate),
        days_count: d.daysCount,
        status: d.status,
      })),
      payment_schedule_info: {
        scheduled_date: toIsoDate(payInfo.scheduledDate),
        effective_date: payInfo.effectiveDate ? toIsoDate(payInfo.effectiveDate) : null,
        projected_date: toIsoDate(payInfo.projectedDate),
        is_advanced: payInfo.isAdvanced,
        status: payInfo.status,
        source: payInfo.source,
      },
      updated_at: new Date().toISOString(),
    });
  })
  );

  return meRouter;
}

export const meRouter = createMeRouter(defaultPrisma);
