import crypto from 'node:crypto';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma as defaultPrisma } from '../db/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { createRequireAuth, requireHrRole } from '../middleware/auth.js';
import { addDaysUtc, countBusinessDays, isValidIsoDate, parseIsoDateUtc, toIsoDate } from '../services/vacationRules.js';
import { parseCalendarFromDb, todayInTimezone } from '../services/paymentSchedule.js';

const IDEM_OP_CREATE = 'create_leave_request';
const IDEM_TTL_MS = 24 * 60 * 60 * 1000;

function computeRequestHash(payload) {
  const canonical = JSON.stringify({
    request_type: payload.request_type,
    start_date: payload.start_date,
    end_date: payload.end_date,
    balance_id: payload.balance_id ?? null,
    reason: payload.reason ?? null,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function serializeLeaveRequest(lr, employeeName, department) {
  return {
    id: lr.id,
    balance_id: lr.balanceId ?? null,
    employee_name: employeeName,
    department,
    request_type: lr.requestType,
    start_date: toIsoDate(lr.startDate),
    end_date: toIsoDate(lr.endDate),
    days_count: Number(lr.daysCount),
    status: lr.status,
    reason: lr.reason,
    approver_notes: lr.approverNotes,
    created_at: lr.createdAt,
  };
}

const isoDateField = z
  .string()
  .refine(isValidIsoDate, 'Fecha inválida o inexistente (usa formato real YYYY-MM-DD)');

const createRequestSchema = z.object({
  request_type: z.enum(['vacaciones', 'permiso_con_goce', 'permiso_sin_goce', 'home_office']),
  start_date: isoDateField,
  end_date: isoDateField,
  balance_id: z.coerce.number().int().positive().optional(),
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

export function createRequestsRouter(prisma = defaultPrisma, { nowFn = todayInTimezone } = {}) {
  const requestsRouter = Router();
  const requireAuth = createRequireAuth(prisma);

  requestsRouter.post(
    '/',
    requireAuth,
    validateBody(createRequestSchema),
    asyncHandler(async (req, res) => {
      const { request_type, start_date, end_date, balance_id, reason } = req.validatedBody;
      const startDate = parseIsoDateUtc(start_date);
      const endDate = parseIsoDateUtc(end_date);
      const idemKey = String(req.headers['x-idempotency-key'] || '').trim();
      if (idemKey.length > 128) {
        throw new AppError(400, 'La clave X-Idempotency-Key excede el máximo de 128 caracteres.');
      }

      if (endDate < startDate) {
        throw new AppError(400, 'La fecha de fin debe ser posterior o igual a la fecha de inicio.');
      }

      const requestHash = computeRequestHash({ request_type, start_date, end_date, balance_id, reason });

      // Consultar idempotencia persistida ANTES de revalidar reglas de negocio (ej. 10 días hábiles)
      if (idemKey) {
        const now = new Date();
        await prisma.idempotencyRecord.deleteMany({
          where: {
            expiresAt: { lte: now },
          },
        });

        const existingIdem = await prisma.idempotencyRecord.findUnique({
          where: {
            employeeId_operation_idempotencyKey: {
              employeeId: req.user.id,
              operation: IDEM_OP_CREATE,
              idempotencyKey: idemKey,
            },
          },
        });

        if (existingIdem) {
          if (existingIdem.requestHash !== requestHash) {
            throw new AppError(
              409,
              'La clave de idempotencia ya fue utilizada con un contenido diferente.'
            );
          }
          if (existingIdem.status === 'completada' && existingIdem.responseBody) {
            return res.status(existingIdem.responseStatus || 200).json(existingIdem.responseBody);
          }
        }
      }

      const today = nowFn();
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

    const runCreateTransaction = () =>
      prisma.$transaction(async (tx) => {
        let idemRecordId = null;
        if (idemKey) {
          const now = new Date();
          await tx.idempotencyRecord.deleteMany({
            where: {
              employeeId: req.user.id,
              operation: IDEM_OP_CREATE,
              idempotencyKey: idemKey,
              expiresAt: { lte: now },
            },
          });

          const existingRows = await tx.$queryRaw`
            SELECT id, request_hash, status, response_status, response_body
            FROM idempotency_records
            WHERE employee_id = ${req.user.id}
              AND operation = ${IDEM_OP_CREATE}
              AND idempotency_key = ${idemKey}
            LIMIT 1
            FOR UPDATE
          `;

          if (existingRows.length > 0) {
            const existingIdem = existingRows[0];
            if (existingIdem.request_hash !== requestHash) {
              throw new AppError(
                409,
                'La clave de idempotencia ya fue utilizada con un contenido diferente.'
              );
            }
            if (existingIdem.status === 'completada' && existingIdem.response_body) {
              const parsedBody =
                typeof existingIdem.response_body === 'string'
                  ? JSON.parse(existingIdem.response_body)
                  : existingIdem.response_body;
              return { status: existingIdem.response_status || 200, body: parsedBody };
            }
          } else {
            const inserted = await tx.idempotencyRecord.create({
              data: {
                employeeId: req.user.id,
                operation: IDEM_OP_CREATE,
                idempotencyKey: idemKey,
                requestHash,
                status: 'en_proceso',
                expiresAt: new Date(now.getTime() + IDEM_TTL_MS),
              },
            });
            idemRecordId = inserted.id;
          }
        }

        const duplicateRows = await tx.$queryRaw`
          SELECT id, status
          FROM leave_requests
          WHERE employee_id = ${req.user.id}
            AND request_type = ${request_type}
            AND start_date = ${start_date}
            AND end_date = ${end_date}
            AND status IN ('pendiente', 'aprobada')
          LIMIT 1
          FOR UPDATE
        `;
        if (duplicateRows.length > 0) {
          throw new AppError(409, 'Ya existe una solicitud activa o pendiente para esas mismas fechas y tipo.');
        }

        let linkedBalanceId = null;
        if (request_type === 'vacaciones') {
          const balRows = balance_id
            ? await tx.$queryRaw`
                SELECT id, entitled_days, used_days, pending_days, available_days
                FROM balances
                WHERE id = ${balance_id} AND employee_id = ${req.user.id}
                LIMIT 1
                FOR UPDATE
              `
            : await tx.$queryRaw`
                SELECT id, entitled_days, used_days, pending_days, available_days
                FROM balances
                WHERE employee_id = ${req.user.id}
                ORDER BY year DESC
                LIMIT 1
                FOR UPDATE
              `;
          const bal = balRows[0];
          if (!bal) {
            throw new AppError(409, 'No se encontró un saldo vacacional válido para vincular a la solicitud.');
          }

          const curPending = Number(bal.pending_days);
          const curUsed = Number(bal.used_days);
          const curAvail = Number(bal.available_days);
          if (curPending < 0 || curUsed < 0 || curAvail < 0) {
            throw new AppError(409, 'Inconsistencia detectada en el saldo vacacional del colaborador.');
          }
          if (curAvail + 1e-6 < daysCount) {
            throw new AppError(400, 'No cuentas con suficientes días disponibles en tu saldo vacacional.');
          }

          const nextPending = Math.round((curPending + daysCount) * 100) / 100;
          const nextAvail = Math.round((curAvail - daysCount) * 100) / 100;
          await tx.balance.update({
            where: { id: bal.id },
            data: {
              pendingDays: new Prisma.Decimal(nextPending.toFixed(2)),
              availableDays: new Prisma.Decimal(nextAvail.toFixed(2)),
            },
          });
          linkedBalanceId = bal.id;
        }

        const created = await tx.leaveRequest.create({
          data: {
            employeeId: req.user.id,
            balanceId: linkedBalanceId,
            requestType: request_type,
            startDate,
            endDate,
            daysCount: new Prisma.Decimal(daysCount.toFixed(2)),
            status: 'pendiente',
            reason: reason ?? null,
          },
        });

        const responseBody = serializeLeaveRequest(created, req.user.fullName, req.user.department);
        if (idemRecordId !== null) {
          await tx.idempotencyRecord.update({
            where: { id: idemRecordId },
            data: {
              status: 'completada',
              responseStatus: 200,
              responseBody,
              resourceId: created.id,
            },
          });
        }

        return { status: 200, body: responseBody };
      });

    let outcome;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        outcome = await runCreateTransaction();
        break;
      } catch (err) {
        const msg = String(err?.message || '');
        const isTransientRace =
          idemKey &&
          attempt < 4 &&
          (err?.code === 'P2002' ||
            err?.code === 'P2034' ||
            msg.includes('uq_idem_emp_op_key') ||
            msg.includes('deadlock') ||
            msg.includes('write conflict'));
        if (isTransientRace) {
          await new Promise((r) => setTimeout(r, 30 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }

    res.status(outcome.status).json(outcome.body);
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
        balance_id: lr.balanceId ?? null,
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
        SELECT id, employee_id, balance_id, request_type, days_count, status
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
        if (!row.balance_id) {
          throw new AppError(
            409,
            'La solicitud de vacaciones no tiene un saldo vinculado; requiere revisión manual antes de resolverse.'
          );
        }

        const balRows = await tx.$queryRaw`
          SELECT id, employee_id, used_days, pending_days, available_days
          FROM balances
          WHERE id = ${row.balance_id}
          LIMIT 1
          FOR UPDATE
        `;
        const bal = balRows[0];
        if (!bal) {
          throw new AppError(409, 'No se encontró el saldo vinculado a esta solicitud.');
        }
        if (bal.employee_id !== row.employee_id) {
          throw new AppError(409, 'Inconsistencia de integridad: el saldo vinculado pertenece a otro colaborador.');
        }

        const days = Number(row.days_count);
        const curPending = Number(bal.pending_days);
        const curUsed = Number(bal.used_days);
        const curAvail = Number(bal.available_days);

        if (curPending + 1e-6 < days) {
          throw new AppError(
            409,
            'Inconsistencia de saldo: los días reservados son insuficientes para completar la operación.'
          );
        }
        if (curUsed < 0 || curAvail < 0) {
          throw new AppError(409, 'Inconsistencia de saldo: existen valores negativos previos.');
        }

        const nextPending = Math.round((curPending - days) * 100) / 100;
        let nextUsed = curUsed;
        let nextAvail = curAvail;

        if (nextStatus === 'aprobada') {
          nextUsed = Math.round((curUsed + days) * 100) / 100;
        } else if (nextStatus === 'rechazada' || nextStatus === 'cancelada') {
          nextAvail = Math.round((curAvail + days) * 100) / 100;
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
      balance_id: updated.balanceId ?? null,
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

  return requestsRouter;
}

export const requestsRouter = createRequestsRouter(defaultPrisma);
