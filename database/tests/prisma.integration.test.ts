import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  decideLeaveRequestTx,
  createTicketWithHistoryTx,
  replaceDocumentChunksTx,
  saveDailyReportTx,
  listMyLeaveRequests,
  listAuthorizedTickets,
} from '../src/services/hrPrismaService.js';

const prisma = new PrismaClient();

test('1. Migraciones aplicadas y relaciones existentes en MySQL', async () => {
  const migrations = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
    SELECT migration_name, finished_at FROM _prisma_migrations WHERE finished_at IS NOT NULL
  `;
  assert.ok(migrations.some((m) => m.migration_name === '20261117000001_add_approver_assignee_and_indexes'));

  const ana = await prisma.employee.findUnique({
    where: { email: 'ana.garcia@nubera.mx' },
    include: { balances: true, leaveRequests: true },
  });
  assert.ok(ana);
  assert.ok(ana.balances.length >= 1);
});

test('2. Transacción atómica de ticket + rollback ante error', async () => {
  const ana = await prisma.employee.findUniqueOrThrow({ where: { email: 'ana.garcia@nubera.mx' } });
  const folio = `TKT-TEST-${Date.now()}`;

  const created = await createTicketWithHistoryTx(prisma, {
    session: { employeeId: ana.id, role: 'colaborador', fullName: ana.fullName, position: ana.position },
    folio,
    topic: 'Prueba transaccional',
    confirmedSummary: 'Resumen de prueba Prisma',
    isSensitive: false,
    assignedToName: 'Laura Patricia Mendoza Ortega',
  });
  assert.equal(created.folio, folio);

  // Intentar duplicar el mismo folio debe fallar por restricción única
  await assert.rejects(
    () =>
      createTicketWithHistoryTx(prisma, {
        session: { employeeId: ana.id, role: 'colaborador', fullName: ana.fullName, position: ana.position },
        folio,
        topic: 'Duplicado',
        confirmedSummary: 'Debe fallar',
        isSensitive: false,
        assignedToName: 'Laura',
      })
  );

  // Limpiar ticket de prueba
  await prisma.ticket.delete({ where: { id: created.id } });
});

test('3. Concurrencia en aprobación de solicitud (evita doble descuento)', async () => {
  const ana = await prisma.employee.findUniqueOrThrow({ where: { email: 'ana.garcia@nubera.mx' } });
  const hr = await prisma.employee.findUniqueOrThrow({ where: { email: 'laura.mendoza@nubera.mx' } });
  const balBefore = await prisma.balance.findFirstOrThrow({ where: { employeeId: ana.id }, orderBy: { year: 'desc' } });

  // Crear solicitud temporal de 1 día reservando saldo
  const tempReq = await prisma.$transaction(async (tx) => {
    await tx.balance.update({
      where: { id: balBefore.id },
      data: {
        pendingDays: new Prisma.Decimal((Number(balBefore.pendingDays) + 1).toFixed(2)),
        availableDays: new Prisma.Decimal((Number(balBefore.availableDays) - 1).toFixed(2)),
      },
    });
    return tx.leaveRequest.create({
      data: {
        employeeId: ana.id,
        requestType: 'vacaciones',
        startDate: new Date('2026-12-15'),
        endDate: new Date('2026-12-15'),
        daysCount: new Prisma.Decimal('1.00'),
        status: 'pendiente',
        reason: 'Prueba concurrencia',
      },
    });
  });

  // Dos aprobaciones concurrentes sobre la misma solicitud
  const approverCtx = { employeeId: hr.id, role: 'rrhh' as const, fullName: hr.fullName, position: hr.position };
  const outcomes = await Promise.allSettled([
    decideLeaveRequestTx(prisma, { requestId: tempReq.id, approver: approverCtx, decision: 'aprobada', notes: 'OK 1' }),
    decideLeaveRequestTx(prisma, { requestId: tempReq.id, approver: approverCtx, decision: 'aprobada', notes: 'OK 2' }),
  ]);

  const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
  const rejected = outcomes.filter((o) => o.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);

  // Restaurar saldo y borrar solicitud temporal
  await prisma.$transaction([
    prisma.leaveRequest.delete({ where: { id: tempReq.id } }),
    prisma.balance.update({
      where: { id: balBefore.id },
      data: {
        usedDays: balBefore.usedDays,
        pendingDays: balBefore.pendingDays,
        availableDays: balBefore.availableDays,
      },
    }),
  ]);
});

test('4. Sustitución atómica de fragmentos, reporte idempotente y filtros por sesión/paginación', async () => {
  const ana = await prisma.employee.findUniqueOrThrow({ where: { email: 'ana.garcia@nubera.mx' } });
  const hr = await prisma.employee.findUniqueOrThrow({ where: { email: 'laura.mendoza@nubera.mx' } });

  const myReqs = await listMyLeaveRequests(
    prisma,
    { employeeId: ana.id, role: 'colaborador', fullName: ana.fullName, position: ana.position },
    1,
    5
  );
  assert.ok(myReqs.length <= 5);

  const colTickets = await listAuthorizedTickets(
    prisma,
    { employeeId: ana.id, role: 'colaborador', fullName: ana.fullName, position: ana.position },
    1,
    10
  );
  const hrTickets = await listAuthorizedTickets(
    prisma,
    { employeeId: hr.id, role: 'rrhh', fullName: hr.fullName, position: hr.position },
    1,
    10
  );
  assert.ok(hrTickets.length >= colTickets.length);

  // Probar sustitución de fragmentos en documento temporal y limpieza
  const tempDoc = await replaceDocumentChunksTx(
    prisma,
    {
      driveFileId: 'TEMP_PRISMA_TEST_DOC',
      policyCode: 'RH-99',
      title: 'Documento temporal Prisma',
      mimeType: 'text/plain',
      version: '1.0',
      effectiveDate: '2026-11-17',
      owner: 'QA',
      driveUrl: 'https://drive.google.com/test',
      contentHash: 'abc123',
    },
    [{ section: 'Sección 1', content: 'Contenido temporal', embedding: [0.1, 0.2] }]
  );
  await prisma.driveDocument.delete({ where: { id: tempDoc.id } });

  // Reporte idempotente
  const repDate = new Date('2026-11-17');
  const existing = await prisma.dailyReport.findUniqueOrThrow({ where: { reportDate: repDate } });
  const saved = await saveDailyReportTx(prisma, repDate, {
    absencesToday: existing.absencesToday,
    pendingRequests: existing.pendingRequests,
    pendingOver3Days: existing.pendingOver3Days,
    activeDisabilities: existing.activeDisabilities,
    resolvedWithoutEscalationPct: existing.resolvedWithoutEscalationPct,
    monthlyDisabilityDays: existing.monthlyDisabilityDays,
    monthlyHires: existing.monthlyHires,
    monthlyExits: existing.monthlyExits,
    turnoverRatePct: existing.turnoverRatePct,
    employeesOver20VacationDays: existing.employeesOver20VacationDays,
    prevDayChatVolume: existing.prevDayChatVolume,
    prevDayAvgLatencyMs: existing.prevDayAvgLatencyMs,
    payloadJson: existing.payloadJson as Prisma.InputJsonValue,
    executiveSummary: existing.executiveSummary,
  });
  assert.equal(saved.id, existing.id);
});

test.after(async () => {
  await prisma.$disconnect();
});
