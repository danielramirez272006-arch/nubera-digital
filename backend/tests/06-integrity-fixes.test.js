import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Prisma, PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { createIsolatedTestEnv, readBaseDatabaseUrl } from './helpers/isolatedDb.js';
import { reconcileRequestBalances } from '../src/services/balanceReconciliation.js';
import { computeVacationEntitlement, isValidIsoDate, parseIsoDateUtc, toIsoDate } from '../src/services/vacationRules.js';

async function apiJson(baseUrl, path, { method = 'GET', token = null, body = undefined, headers: extra = {} } = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

test('Reconciliación acumulada de saldos, cambios entre preview/apply e idempotencia con reloj controlado', async () => {
  let fakeToday = parseIsoDateUtc('2026-11-20');
  const env = await createIsolatedTestEnv({ tag: 'int_main', nowFn: () => fakeToday });

  try {
    const { prisma, baseUrl, users, balances } = env;

    // 1. Validación estricta de fechas reales y bisiestos
    assert.equal(isValidIsoDate('2027-02-31'), false);
    assert.equal(isValidIsoDate('2026-13-01'), false);
    assert.equal(isValidIsoDate('2025-02-29'), false);
    assert.equal(isValidIsoDate('2024-02-29'), true);
    assert.throws(() => parseIsoDateUtc('2027-02-31'));

    const leap1 = computeVacationEntitlement(parseIsoDateUtc('2024-02-29'), parseIsoDateUtc('2025-03-01'));
    assert.equal(leap1.yearsOfService, 1);
    assert.equal(toIsoDate(leap1.anniversaryDate), '2025-02-28');

    // 2. Reconciliación acumulada: saldo con pending_days=4 y dos solicitudes pendientes de 3 días (3+3=6 > 4)
    const balOver = await prisma.balance.create({
      data: {
        employeeId: users.otherCollab.id,
        year: 2025,
        entitledDays: new Prisma.Decimal('15.00'),
        usedDays: new Prisma.Decimal('0.00'),
        pendingDays: new Prisma.Decimal('4.00'),
        availableDays: new Prisma.Decimal('11.00'),
        expirationDate: new Date('2026-05-01'),
      },
    });
    // Ajustar balOther2026 para que tenga pending=0 y la ventana de 2025 apunte a balOver
    await prisma.balance.update({
      where: { id: balances.balOther2026.id },
      data: { availableDays: new Prisma.Decimal('16.00'), pendingDays: new Prisma.Decimal('0.00') },
    });

    // Una solicitud ya vinculada (3 días) + otra pendiente por reconstruir (3 días) sobre balOver (pending=4)
    const reqLinked = await prisma.leaveRequest.create({
      data: {
        employeeId: users.otherCollab.id,
        balanceId: balOver.id,
        requestType: 'vacaciones',
        startDate: new Date('2025-06-10'),
        endDate: new Date('2025-06-12'),
        daysCount: new Prisma.Decimal('3.00'),
        status: 'pendiente',
      },
    });
    const reqUnlinked = await prisma.leaveRequest.create({
      data: {
        employeeId: users.otherCollab.id,
        balanceId: null,
        requestType: 'vacaciones',
        startDate: new Date('2025-07-14'),
        endDate: new Date('2025-07-16'),
        daysCount: new Prisma.Decimal('3.00'),
        status: 'pendiente',
      },
    });

    const overPreview = await reconcileRequestBalances(prisma, { apply: false });
    const ambIds = new Set(overPreview.ambiguousCases.map((a) => a.requestId));
    assert.ok(ambIds.has(reqLinked.id), 'Debe detectar inconsistencia acumulada en solicitud ya vinculada');
    assert.ok(ambIds.has(reqUnlinked.id), 'Debe detectar inconsistencia acumulada en solicitud por reconstruir');

    // Al aplicar, ambas quedan desvinculadas sin elegir arbitrariamente por ID
    await reconcileRequestBalances(prisma, { apply: true, expectedSnapshot: overPreview.snapshot });
    const [rL, rU] = await Promise.all([
      prisma.leaveRequest.findUnique({ where: { id: reqLinked.id } }),
      prisma.leaveRequest.findUnique({ where: { id: reqUnlinked.id } }),
    ]);
    assert.equal(rL.balanceId, null);
    assert.equal(rU.balanceId, null);

    // Repetición de la reconciliación inmediatamente después: 0 cambios adicionales
    const secondRun = await reconcileRequestBalances(prisma, { apply: false });
    assert.equal(secondRun.changes.length, 0);

    // Cambio de saldo entre vista previa y aplicación -> aborta con error y no aplica cambios
    await prisma.balance.update({
      where: { id: balOver.id },
      data: { pendingDays: new Prisma.Decimal('6.00'), availableDays: new Prisma.Decimal('9.00') },
    });
    await assert.rejects(
      () => reconcileRequestBalances(prisma, { apply: true, expectedSnapshot: secondRun.snapshot }),
      /cambió después de la vista previa/
    );

    // Con pendingDays=6 ya coincide 3+3=6 -> ahora sí vincula ambas inequívocamente
    const cleanPreview = await reconcileRequestBalances(prisma, { apply: false });
    const cleanApply = await reconcileRequestBalances(prisma, {
      apply: true,
      expectedSnapshot: cleanPreview.snapshot,
    });
    assert.equal(cleanApply.appliedCount, 2);

    // 3. Idempotencia evaluada ANTES de revalidar negocio (prueba con reloj controlado)
    const collabTok = (
      await apiJson(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: users.collab.email, password: 'TestCollab123!' },
      })
    ).data.access_token;

    const clockKey = `clock-idem-${Date.now()}`;
    const vacPayload = {
      request_type: 'vacaciones',
      balance_id: balances.balCollab2026.id,
      start_date: '2026-12-10',
      end_date: '2026-12-11',
      reason: 'Prueba reloj controlado',
    };

    // En 2026-11-20 hay >=10 días hábiles antes del 2026-12-10 -> crea solicitud (2 días)
    const firstRes = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: collabTok,
      headers: { 'X-Idempotency-Key': clockKey },
      body: vacPayload,
    });
    assert.equal(firstRes.status, 200);
    assert.equal(firstRes.data.days_count, 2);

    const balAfterFirst = await prisma.balance.findUnique({ where: { id: balances.balCollab2026.id } });
    assert.equal(Number(balAfterFirst.pendingDays), 5); // 3 inicial + 2 nuevos

    // Simular pérdida de respuesta y avanzar reloj a 2026-12-05 (ya NO cumple 10 días hábiles para solicitud nueva)
    fakeToday = parseIsoDateUtc('2026-12-05');

    const newReqBlocked = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: collabTok,
      headers: { 'X-Idempotency-Key': `fresh-key-${Date.now()}` },
      body: { ...vacPayload, start_date: '2026-12-14', end_date: '2026-12-15' },
    });
    assert.equal(newReqBlocked.status, 400);

    // Reintento con la misma clave y contenido -> devuelve resultado original (200) sin volver a reservar
    const retryAfterClock = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: collabTok,
      headers: { 'X-Idempotency-Key': clockKey },
      body: vacPayload,
    });
    assert.equal(retryAfterClock.status, 200);
    assert.equal(retryAfterClock.data.id, firstRes.data.id);

    const balAfterRetry = await prisma.balance.findUnique({ where: { id: balances.balCollab2026.id } });
    assert.equal(Number(balAfterRetry.pendingDays), 5);

    // Misma clave con contenido diferente -> 409 Conflict
    const diffRes = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: collabTok,
      headers: { 'X-Idempotency-Key': clockKey },
      body: { ...vacPayload, end_date: '2026-12-14' },
    });
    assert.equal(diffRes.status, 409);

    // Recrear instancia de Express con el mismo Prisma aislado -> sigue recuperando la respuesta original
    const restartedApp = createApp({ prisma, nowFn: () => fakeToday });
    const restartedServer = http.createServer(restartedApp);
    const restartedUrl = await new Promise((resolve) => {
      restartedServer.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${restartedServer.address().port}`);
      });
    });
    try {
      const replayRestart = await apiJson(restartedUrl, '/api/requests', {
        method: 'POST',
        token: collabTok,
        headers: { 'X-Idempotency-Key': clockKey },
        body: vacPayload,
      });
      assert.equal(replayRestart.status, 200);
      assert.equal(replayRestart.data.id, firstRes.data.id);
    } finally {
      await new Promise((resolve) => restartedServer.close(resolve));
    }

    // 4. Concurrencia de idempotencia (dos peticiones simultáneas con misma clave) + aprobar/repetir/rechazar/cancelar
    const hrTok = (
      await apiJson(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: users.hrDirector.email, password: 'TestHr123!' },
      })
    ).data.access_token;

    fakeToday = parseIsoDateUtc('2026-11-20');
    const concKey = `conc-idem-${Date.now()}`;
    const concPayload = {
      request_type: 'vacaciones',
      balance_id: balances.balCollab2026.id,
      start_date: '2027-01-18',
      end_date: '2027-01-19',
      reason: 'Concurrencia idempotente',
    };
    const [c1, c2] = await Promise.all([
      apiJson(baseUrl, '/api/requests', {
        method: 'POST',
        token: collabTok,
        headers: { 'X-Idempotency-Key': concKey },
        body: concPayload,
      }),
      apiJson(baseUrl, '/api/requests', {
        method: 'POST',
        token: collabTok,
        headers: { 'X-Idempotency-Key': concKey },
        body: concPayload,
      }),
    ]);
    assert.equal(c1.status, 200);
    assert.equal(c2.status, 200);
    assert.equal(c1.data.id, c2.data.id);

    // Aprobar y repetir la misma aprobación -> solo descuenta una vez
    const app1 = await apiJson(baseUrl, `/api/requests/${c1.data.id}`, {
      method: 'PATCH',
      token: hrTok,
      body: { status: 'aprobada' },
    });
    const app2 = await apiJson(baseUrl, `/api/requests/${c1.data.id}`, {
      method: 'PATCH',
      token: hrTok,
      body: { status: 'aprobada' },
    });
    assert.equal(app1.status, 200);
    assert.equal(app2.status, 200);

    const balAfterApp = await prisma.balance.findUnique({ where: { id: balances.balCollab2026.id } });
    assert.equal(Number(balAfterApp.usedDays), 4); // 2 inicial + 2 aprobados
    assert.equal(Number(balAfterApp.pendingDays), 5); // los 3 iniciales + 2 de firstRes

    // Rechazar libera reserva; Cancelar libera reserva
    const reqRej = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: collabTok,
      body: { request_type: 'vacaciones', start_date: '2027-02-01', end_date: '2027-02-02' },
    });
    assert.equal(reqRej.status, 200);
    const rejRes = await apiJson(baseUrl, `/api/requests/${reqRej.data.id}`, {
      method: 'PATCH',
      token: hrTok,
      body: { status: 'rechazada' },
    });
    assert.equal(rejRes.status, 200);

    const reqCan = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: collabTok,
      body: { request_type: 'vacaciones', start_date: '2027-02-08', end_date: '2027-02-09' },
    });
    assert.equal(reqCan.status, 200);
    const canRes = await apiJson(baseUrl, `/api/requests/${reqCan.data.id}`, {
      method: 'PATCH',
      token: collabTok,
      body: { status: 'cancelada' },
    });
    assert.equal(canRes.status, 200);

    const balAfterRelease = await prisma.balance.findUnique({ where: { id: balances.balCollab2026.id } });
    assert.equal(Number(balAfterRelease.pendingDays), 5);

    // Expiración de vigencia de clave de idempotencia -> permite nueva operación al expirar
    await prisma.idempotencyRecord.updateMany({
      where: { idempotencyKey: concKey },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const afterExp = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: collabTok,
      headers: { 'X-Idempotency-Key': concKey },
      body: { ...concPayload, start_date: '2027-02-15', end_date: '2027-02-16' },
    });
    assert.equal(afterExp.status, 200);
    assert.notEqual(afterExp.data.id, c1.data.id);
  } finally {
    await env.cleanup();
  }
});

test('Aislamiento real con inyección explícita: instancia A, instancia B y base habitual separadas', async () => {
  const prodUrl = await readBaseDatabaseUrl();
  const prodPrisma = new PrismaClient({ datasources: { db: { url: prodUrl } } });
  const prodTicketsBefore = await prodPrisma.ticket.count();

  const [envA, envB] = await Promise.all([
    createIsolatedTestEnv({ tag: 'instA' }),
    createIsolatedTestEnv({ tag: 'instB' }),
  ]);

  try {
    assert.notEqual(envA.dbName, envB.dbName);

    const tokA = (
      await apiJson(envA.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: envA.users.collab.email, password: 'TestCollab123!' },
      })
    ).data.access_token;

    const tokB = (
      await apiJson(envB.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: envB.users.collab.email, password: 'TestCollab123!' },
      })
    ).data.access_token;

    // Crear ticket en instancia A
    const createdA = await apiJson(envA.baseUrl, '/api/tickets', {
      method: 'POST',
      token: tokA,
      body: {
        topic: 'Ticket exclusivo instancia A',
        confirmed_summary: 'Registro que solo debe existir en la base temporal de instancia A.',
        is_sensitive: false,
      },
    });
    assert.equal(createdA.status, 200);

    // Crear ticket distinto en instancia B en paralelo
    const createdB = await apiJson(envB.baseUrl, '/api/tickets', {
      method: 'POST',
      token: tokB,
      body: {
        topic: 'Ticket exclusivo instancia B',
        confirmed_summary: 'Registro independiente en instancia B sin colisión con A.',
        is_sensitive: false,
      },
    });
    assert.equal(createdB.status, 200);

    // Existe en A, NO existe en B ni en la base habitual
    const inA = await envA.prisma.ticket.findUnique({ where: { folio: createdA.data.folio } });
    const inB = await envB.prisma.ticket.findUnique({ where: { folio: createdA.data.folio } });
    const inProd = await prodPrisma.ticket.findUnique({ where: { folio: createdA.data.folio } });
    assert.ok(inA);
    assert.equal(inB, null);
    assert.equal(inProd, null);

    // Y el ticket de B solo existe en B
    const bInA = await envA.prisma.ticket.findUnique({ where: { folio: createdB.data.folio } });
    assert.equal(bInA, null);
  } finally {
    await Promise.all([envA.cleanup(), envB.cleanup()]);
  }

  const prodTicketsAfter = await prodPrisma.ticket.count();
  await prodPrisma.$disconnect();
  assert.equal(prodTicketsAfter, prodTicketsBefore);
});
