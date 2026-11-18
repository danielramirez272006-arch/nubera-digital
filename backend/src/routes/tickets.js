import { Router } from 'express';
import { z } from 'zod';
import { prisma as defaultPrisma } from '../db/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { createRequireAuth, requireHrRole } from '../middleware/auth.js';

const createTicketSchema = z.object({
  topic: z.string().min(3).max(120),
  confirmed_summary: z.string().min(10).max(2000),
  is_sensitive: z.boolean().default(false),
});

const updateTicketSchema = z.object({
  status: z.enum(['abierto', 'en_proceso', 'resuelto', 'cerrado']),
  notes: z.string().min(3).max(1000),
  assignee_id: z.coerce.number().int().positive().optional(),
  assigned_to: z.string().min(2).max(150).optional(),
});

function serializeTicket(t) {
  return {
    id: t.id,
    folio: t.folio,
    employee_name: t.employee?.fullName || 'Colaborador',
    department: t.employee?.department || 'N/A',
    topic: t.topic,
    confirmed_summary: t.confirmed_summary ?? t.confirmedSummary,
    status: t.status,
    assignee_id: t.assigneeId ?? null,
    assigned_to: t.assignee?.fullName || t.assignedTo,
    is_sensitive: t.isSensitive,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    history: (t.history || []).map((h) => ({
      id: h.id,
      actor_name: h.actorName,
      action: h.action,
      notes: h.notes,
      created_at: h.createdAt,
    })),
  };
}

export function createTicketsRouter(prisma = defaultPrisma) {
  const ticketsRouter = Router();
  const requireAuth = createRequireAuth(prisma);

  ticketsRouter.post(
  '/',
  requireAuth,
  validateBody(createTicketSchema),
  asyncHandler(async (req, res) => {
    const { topic, confirmed_summary, is_sensitive } = req.validatedBody;
    const assignedToName = is_sensitive ? 'Laura Patricia Mendoza Ortega' : 'Diego Alejandro Santos Rivera';

    const assignee = await prisma.employee.findFirst({
      where: { fullName: assignedToName, role: 'rrhh', status: 'activo' },
      select: { id: true, fullName: true },
    });
    if (!assignee) {
      throw new AppError(409, `No se encontró un responsable activo de RRHH (${assignedToName}) para asignar el ticket.`);
    }

    const created = await prisma.$transaction(async (tx) => {
      const year = new Date().getUTCFullYear();
      const count = (await tx.ticket.count()) + 1;
      const folio = `TKT-${year}-${String(count).padStart(4, '0')}-${Date.now().toString().slice(-3)}`;

      const ticket = await tx.ticket.create({
        data: {
          folio,
          employeeId: req.user.id,
          assigneeId: assignee.id,
          topic,
          confirmedSummary: confirmed_summary,
          status: 'abierto',
          assignedTo: assignee.fullName,
          isSensitive: is_sensitive,
        },
      });

      await tx.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          actorName: req.user.fullName,
          action: 'Creación de ticket',
          notes: `Ticket creado y asignado a ${assignee.fullName} tras confirmación explícita del colaborador.`,
        },
      });

      return tx.ticket.findUnique({
        where: { id: ticket.id },
        include: {
          employee: { select: { fullName: true, department: true } },
          assignee: { select: { id: true, fullName: true } },
          history: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    res.json(serializeTicket(created));
  })
);

ticketsRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tickets = await prisma.ticket.findMany({
      where: { employeeId: req.user.id },
      include: {
        employee: { select: { fullName: true, department: true } },
        assignee: { select: { id: true, fullName: true } },
        history: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(tickets.map(serializeTicket));
  })
);

ticketsRouter.get(
  '/',
  requireAuth,
  requireHrRole,
  asyncHandler(async (req, res) => {
    const isDirector = (req.user.position || '').includes('Directora');
    const where = isDirector
      ? {}
      : {
          OR: [{ isSensitive: false }, { assigneeId: req.user.id }],
        };

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        employee: { select: { fullName: true, department: true } },
        assignee: { select: { id: true, fullName: true } },
        history: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(tickets.map(serializeTicket));
  })
);

ticketsRouter.patch(
  '/:id',
  requireAuth,
  requireHrRole,
  validateBody(updateTicketSchema),
  asyncHandler(async (req, res) => {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      throw new AppError(400, 'Identificador de ticket inválido.');
    }

    const { status, notes, assignee_id, assigned_to } = req.validatedBody;
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.ticket.findUnique({
        where: { id: ticketId },
        include: { assignee: { select: { id: true, fullName: true } } },
      });
      if (!existing) throw new AppError(404, 'Ticket no encontrado.');

      const isDirector = (req.user.position || '').includes('Directora');
      if (existing.isSensitive && existing.assigneeId !== req.user.id && !isDirector) {
        throw new AppError(403, 'Acceso denegado a ticket sensible.');
      }

      let nextAssigneeId = existing.assigneeId;
      let nextAssignedTo = existing.assignee?.fullName || existing.assignedTo;
      let reassignedToName = null;

      if (assignee_id !== undefined || assigned_to !== undefined) {
        const target = assignee_id !== undefined
          ? await tx.employee.findUnique({
              where: { id: assignee_id },
              select: { id: true, fullName: true, role: true, status: true },
            })
          : await tx.employee.findFirst({
              where: { fullName: assigned_to },
              select: { id: true, fullName: true, role: true, status: true },
            });

        if (!target || target.status !== 'activo' || target.role !== 'rrhh') {
          throw new AppError(
            400,
            'El responsable asignado debe existir, estar activo y pertenecer al rol de RRHH.'
          );
        }

        if (target.id !== existing.assigneeId) {
          reassignedToName = target.fullName;
        }
        nextAssigneeId = target.id;
        nextAssignedTo = target.fullName;
      }

      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status,
          assigneeId: nextAssigneeId,
          assignedTo: nextAssignedTo,
        },
      });

      const actionLabel = reassignedToName
        ? `Reasignación a ${reassignedToName} y actualización a ${status}`
        : `Actualización a ${status}`;

      await tx.ticketHistory.create({
        data: {
          ticketId,
          actorName: req.user.fullName,
          action: actionLabel,
          notes,
        },
      });

      return tx.ticket.findUnique({
        where: { id: ticketId },
        include: {
          employee: { select: { fullName: true, department: true } },
          assignee: { select: { id: true, fullName: true } },
          history: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    res.json(serializeTicket(updated));
  })
  );

  return ticketsRouter;
}

export const ticketsRouter = createTicketsRouter(defaultPrisma);
