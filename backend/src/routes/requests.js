import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { requireAuth, requireHrRole } from '../middleware/auth.js';
import { addDaysUtc, countBusinessDays, parseIsoDateUtc, toIsoDate } from '../services/vacationRules.js';
import { parseCalendarFromDb, todayInTimezone } from '../services/paymentSchedule.js';

export const requestsRouter = Router();

const createRequestSchema = z.object({
  request_type: z.enum(['vacaciones', 'permiso_con_goce', 'permiso_sin_goce', 'home_office']),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha esperado: YYYY-MM-DD'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha esperado: YYYY-MM-DD'),
  reason: z.string().max(500).optional().nullable(),
});

const listRequestsQuerySchema = z.object({
  status_filter: z.enum(['pendiente', 'aprobada', 'rechazada', 'cancelada', '']).optional(),
  department: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(60),
});

const decideRequestSchema = z.object({
  status: z.enum(['aprobada', 'rechazada', 'cancelada']),
  approver_notes: z.string().max(500).optional().nullable(),
});

requestsRouter.post(
  '/',
  requireAuth,
  validateBody(createRequestSchema),
  asyncHandler(async (req, res) => {
    const { request_type, start_date, end_date, reason } = req.validatedBody;
    const startDate = parseIsoDateUtc(start_date);
    const endDate = parseIsoDateUtc(end_date);

    if (endDate < startDate) {
      throw new AppError(400, 'La fecha de fin debe ser posterior o igual a la fecha de inicio.');
    }

    const today = todayInTimezone();
    const { holidays } = await parseCalendarFromDb(prisma);
    const daysCount = countBusinessDays(startDate, endDate, holidays);
    if (daysCount <= 0) {
      throw new AppError(400, 'El periodo seleccionado debe incluir al menos un día hábil.');
    }

    if (request_type === 'vacaciones') {
      const leadDays = countBusinessDays(addDaysUtc(today, 1), startDate, holidays);
      if (leadDays < 10) {
        throw new AppError(
          400,
          'Conforme a RH-01, las vacaciones deben solicitarse con al menos 10 días hábiles de anticipación.'
        );
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      if (request_type === 'vacaciones') {
        const balRows = await tx.$queryRaw`
          SELECT id, pending_days, available_days
          FROM balances
          WHERE employee_id = ${req.user.id}
          ORDER BY year DESC
          LIMIT 1
          FOR UPDATE
        `;
        const bal = balRows[0];
        if (!bal || Number(bal.available_days) < daysCount) {
          throw new AppError(400, 'No cuentas con suficientes días disponibles en tu saldo vacacional.');
        }

        const nextPending = Number(bal.pending_days) + daysCount;
        const nextAvail = Number(bal.available_days) - daysCount;
        await tx.balance.update({
          where: { id: bal.id },
          data: {
            pendingDays: new Prisma.Decimal(nextPending.toFixed(2)),
            availableDays: new Prisma.Decimal(nextAvail.toFixed(2)),
          },
        });
      }

      return tx.leaveRequest.create({
        data: {
          employeeId: req.user.id,
          requestType: request_type,
          startDate,
          endDate,
          daysCount: new Prisma.Decimal(daysCount.toFixed(2)),
          status: 'pendiente',
          reason: reason ?? null,
        },
      });
    });

    res.json({
      id: created.id,
      employee_name: req.user.fullName,
      department: req.user.department,
      request_type: created.requestType,
      start_date: toIsoDate(created.startDate),
      end_date: toIsoDate(created.endDate),
      days_count: Number(created.daysCount),
      status: created.status,
      reason: created.reason,
      approver_notes: created.approverNotes,
      created_at: created.createdAt,
    });
  })
);

requestsRouter.get(
  '/',
  requireAuth,
  requireHrRole,
  validateQuery(listRequestsQuerySchema),
  asyncHandler(async (req, res) => {
    const { status_filter, department, page, page_size } = req.validatedQuery;
    const where = {};
    if (status_filter) where.status = status_filter;
    if (department) where.employee = { department };

    const rows = await prisma.leaveRequest.findMany({
      where,
      include: {
        employee: { select: { fullName: true, department: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * page_size,
      take: page_size,
    });

    res.json(
      rows.map((lr) => ({
        id: lr.id,
        employee_name: lr.employee?.fullName || '',
        department: lr.employee?.department || '',
        request_type: lr.requestType,
        start_date: toIsoDate(lr.startDate),
        end_date: toIsoDate(lr.endDate),
        days_count: Number(lr.daysCount),
        status: lr.status,
        reason: lr.reason,
        approver_notes: lr.approverNotes,
        created_at: lr.createdAt,
      }))
    );
  })
);

requestsRouter.patch(
  '/:id',
  requireAuth,
  validateBody(decideRequestSchema),
  asyncHandler(async (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new AppError(400, 'Identificador de solicitud inválido.');
    }

    const { status: nextStatus, approver_notes } = req.validatedBody;
    if (req.user.role !== 'rrhh' && nextStatus !== 'cancelada') {
      throw new AppError(403, 'Acceso denegado. Solo el equipo de RRHH puede aprobar o rechazar solicitudes.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT id, employee_id, request_type, days_count, status
        FROM leave_requests
        WHERE id = ${requestId}
        FOR UPDATE
      `;
      const row = locked[0];
      if (!row) {
        throw new AppError(404, 'Solicitud no encontrada.');
      }

      if (nextStatus === 'cancelada' && req.user.role !== 'rrhh' && row.employee_id !== req.user.id) {
        throw new AppError(403, 'No tienes permiso para cancelar solicitudes de otro colaborador.');
      }

      // Idempotencia si ya fue resuelta con el mismo estado; conflicto si ya tiene otro estado final
      if (row.status !== 'pendiente') {
        if (row.status === nextStatus) {
          return tx.leaveRequest.findUnique({
            where: { id: row.id },
            include: { employee: { select: { fullName: true, department: true } } },
          });
        }
        throw new AppError(409, `La solicitud ya fue resuelta previamente como '${row.status}'.`);
      }

      if (row.request_type === 'vacaciones') {
        const balRows = await tx.$queryRaw`
          SELECT id, used_days, pending_days, available_days
          FROM balances
          WHERE employee_id = ${row.employee_id}
          ORDER BY year DESC
          LIMIT 1
          FOR UPDATE
        `;
        const bal = balRows[0];
        if (bal) {
          const days = Number(row.days_count);
          const nextPending = Math.max(0, Number(bal.pending_days) - days);
          let nextUsed = Number(bal.used_days);
          let nextAvail = Number(bal.available_days);

          if (nextStatus === 'aprobada') {
            nextUsed += days;
          } else if (nextStatus === 'rechazada' || nextStatus === 'cancelada') {
            nextAvail += days;
          }

          await tx.balance.update({
            where: { id: bal.id },
            data: {
              pendingDays: new Prisma.Decimal(nextPending.toFixed(2)),
              usedDays: new Prisma.Decimal(nextUsed.toFixed(2)),
              availableDays: new Prisma.Decimal(nextAvail.toFixed(2)),
            },
          });
        }
      }

      return tx.leaveRequest.update({
        where: { id: row.id },
        data: {
          status: nextStatus,
          approverId: req.user.id,
          approverNotes: approver_notes ?? null,
          resolvedAt: new Date(),
        },
        include: { employee: { select: { fullName: true, department: true } } },
      });
    });

    res.json({
      id: updated.id,
      employee_name: updated.employee?.fullName || '',
      department: updated.employee?.department || '',
      request_type: updated.requestType,
      start_date: toIsoDate(updated.startDate),
      end_date: toIsoDate(updated.endDate),
      days_count: Number(updated.daysCount),
      status: updated.status,
      reason: updated.reason,
      approver_notes: updated.approverNotes,
      created_at: updated.createdAt,
    });
  })
);
