import { PrismaClient, Prisma, LeaveRequestStatus, TicketStatus } from '@prisma/client';

export interface SessionContext {
  employeeId: number;
  role: 'colaborador' | 'rrhh';
  fullName: string;
  position: string;
}

/**
 * Transacción atómica con bloqueo de fila (SELECT ... FOR UPDATE) para aprobar o rechazar
 * una solicitud evitando descuentos repetidos y aprobaciones concurrentes.
 */
export async function decideLeaveRequestTx(
  prisma: PrismaClient,
  params: {
    requestId: number;
    approver: SessionContext;
    decision: 'aprobada' | 'rechazada' | 'cancelada';
    notes?: string;
  }
) {
  if (params.approver.role !== 'rrhh' && params.decision !== 'cancelada') {
    throw new Error('FORBIDDEN: Solo RRHH puede aprobar o rechazar solicitudes.');
  }

  return prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<
      Array<{ id: number; employee_id: number; request_type: string; days_count: string; status: string }>
    >`SELECT id, employee_id, request_type, days_count, status FROM leave_requests WHERE id = ${params.requestId} FOR UPDATE`;

    const req = lockedRows[0];
    if (!req) throw new Error('NOT_FOUND: Solicitud no encontrada.');
    if (req.status !== 'pendiente') {
      throw new Error(`CONFLICT: La solicitud ya fue resuelta (${req.status}).`);
    }
    if (params.decision === 'cancelada' && params.approver.role !== 'rrhh' && req.employee_id !== params.approver.employeeId) {
      throw new Error('FORBIDDEN: No puedes cancelar solicitudes de otro colaborador.');
    }

    if (req.request_type === 'vacaciones') {
      const balRows = await tx.$queryRaw<
        Array<{ id: number; used_days: string; pending_days: string; available_days: string }>
      >`SELECT id, used_days, pending_days, available_days FROM balances WHERE employee_id = ${req.employee_id} ORDER BY year DESC LIMIT 1 FOR UPDATE`;

      const bal = balRows[0];
      if (!bal) throw new Error('NOT_FOUND: Saldo vacacional no encontrado.');

      const days = Number(req.days_count);
      const curPending = Number(bal.pending_days);
      const curUsed = Number(bal.used_days);
      const curAvail = Number(bal.available_days);

      const nextPending = Math.max(0, curPending - days);
      const nextUsed = params.decision === 'aprobada' ? curUsed + days : curUsed;
      const nextAvail = params.decision === 'aprobada' ? curAvail : curAvail + days;

      if (nextAvail < 0) {
        throw new Error('INSUFFICIENT_BALANCE: Saldo insuficiente.');
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
      where: { id: req.id },
      data: {
        status: params.decision as LeaveRequestStatus,
        approverId: params.approver.employeeId,
        approverNotes: params.notes ?? null,
        resolvedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        approverId: true,
        resolvedAt: true,
        daysCount: true,
      },
    });
  });
}

/**
 * Transacción atómica para crear un ticket y su primer registro de historial.
 */
export async function createTicketWithHistoryTx(
  prisma: PrismaClient,
  params: {
    session: SessionContext;
    folio: string;
    topic: string;
    confirmedSummary: string;
    isSensitive: boolean;
    assigneeId?: number;
    assignedToName: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: {
        folio: params.folio,
        employeeId: params.session.employeeId,
        assigneeId: params.assigneeId ?? null,
        topic: params.topic,
        confirmedSummary: params.confirmedSummary,
        status: TicketStatus.abierto,
        assignedTo: params.assignedToName,
        isSensitive: params.isSensitive,
      },
      select: { id: true, folio: true, status: true, employeeId: true },
    });

    await tx.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        actorName: params.session.fullName,
        action: 'Creación de ticket',
        notes: 'Ticket creado tras confirmación explícita del colaborador.',
      },
    });

    return ticket;
  });
}

/**
 * Transacción atómica para sustituir los fragmentos de un documento sin duplicados.
 */
export async function replaceDocumentChunksTx(
  prisma: PrismaClient,
  doc: {
    driveFileId: string;
    policyCode: string;
    title: string;
    mimeType: string;
    version: string;
    effectiveDate: string;
    owner: string;
    driveUrl: string;
    contentHash: string;
  },
  chunks: Array<{ section: string; content: string; embedding: number[] }>
) {
  return prisma.$transaction(async (tx) => {
    const savedDoc = await tx.driveDocument.upsert({
      where: { driveFileId: doc.driveFileId },
      update: {
        policyCode: doc.policyCode,
        title: doc.title,
        mimeType: doc.mimeType,
        version: doc.version,
        effectiveDate: doc.effectiveDate,
        owner: doc.owner,
        driveUrl: doc.driveUrl,
        contentHash: doc.contentHash,
        status: 'activo',
        lastSyncedAt: new Date(),
      },
      create: {
        ...doc,
        status: 'activo',
        lastSyncedAt: new Date(),
      },
      select: { id: true, driveFileId: true, policyCode: true },
    });

    await tx.documentChunk.deleteMany({ where: { documentId: savedDoc.id } });

    if (chunks.length > 0) {
      await tx.documentChunk.createMany({
        data: chunks.map((c, idx) => ({
          documentId: savedDoc.id,
          driveFileId: doc.driveFileId,
          policyCode: doc.policyCode,
          title: doc.title,
          section: c.section,
          version: doc.version,
          effectiveDate: doc.effectiveDate,
          owner: doc.owner,
          driveUrl: doc.driveUrl,
          chunkIndex: idx,
          content: c.content,
          embedding: c.embedding,
        })),
      });
    }

    return savedDoc;
  });
}

/**
 * Guarda o actualiza un reporte diario de forma idempotente por fecha de corte.
 */
export async function saveDailyReportTx(
  prisma: PrismaClient,
  reportDate: Date,
  data: Omit<Prisma.DailyReportCreateInput, 'reportDate'>
) {
  return prisma.$transaction((tx) =>
    tx.dailyReport.upsert({
      where: { reportDate },
      update: { ...data, generatedAt: new Date() },
      create: { reportDate, ...data, generatedAt: new Date() },
      select: { id: true, reportDate: true, absencesToday: true },
    })
  );
}

/**
 * Consultas paginadas y acotadas por sesión (sin N+1 ni sobre-exposición de campos).
 */
export async function listMyLeaveRequests(
  prisma: PrismaClient,
  session: SessionContext,
  page = 1,
  pageSize = 20
) {
  return prisma.leaveRequest.findMany({
    where: { employeeId: session.employeeId },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      requestType: true,
      startDate: true,
      endDate: true,
      daysCount: true,
      status: true,
      approver: { select: { fullName: true } },
      createdAt: true,
    },
  });
}

export async function listAuthorizedTickets(
  prisma: PrismaClient,
  session: SessionContext,
  page = 1,
  pageSize = 20
) {
  const where: Prisma.TicketWhereInput =
    session.role === 'rrhh'
      ? {
          OR: [
            { isSensitive: false },
            { assigneeId: session.employeeId },
            { assignedTo: session.fullName },
          ],
        }
      : { employeeId: session.employeeId };

  return prisma.ticket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      folio: true,
      topic: true,
      status: true,
      isSensitive: true,
      assignedTo: true,
      employee: { select: { fullName: true, department: true } },
      history: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, actorName: true, action: true, createdAt: true },
      },
    },
  });
}
