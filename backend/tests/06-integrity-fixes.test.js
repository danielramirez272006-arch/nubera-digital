import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Prisma, PrismaClient } from '@prisma/client';
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

test('Isolated DB: Reconciliación de saldos, idempotencia persistente, tickets, fechas y cero impacto en portal', async () => {
  // Snapshot de lectura en la base habitual del portal para comprobar que no se modifica nada
  const prodUrl = await readBaseDatabaseUrl();
  const prodReader = new PrismaClient({ datasources: { db: { url: prodUrl } } });
  const beforeProd = {
    requests: await prodReader.leaveRequest.count(),
    idem: await prodReader.idempotencyRecord.count(),
    anaBal: await prodReader.balance.findFirst({
      where: { employee: { email: 'ana.garcia@nubera.mx' } },
      orderBy: { year: 'desc' },
      select: { usedDays: true, pendingDays: true, availableDays: true },
    }),
  };

  const env = await createIsolatedTestEnv({ tag: 'main' });

  try {
    const { prisma, baseUrl, users, balances } = env;

    // --- 4. Validación estricta de fechas reales y bisiestos ---
    assert.equal(isValidIsoDate('2027-02-31'), false);
    assert.equal(isValidIsoDate('2026-13-01'), false);
    assert.equal(isValidIsoDate('2025-02-29'), false);
    assert.equal(isValidIsoDate('2026-2-5'), false);
    assert.equal(isValidIsoDate('2024-02-29'), true);
    assert.throws(() => parseIsoDateUtc('2027-02-31'));

    const leap1 = computeVacationEntitlement(parseIsoDateUtc('2024-02-29'), parseIsoDateUtc('2025-03-01'));
    assert.equal(leap1.yearsOfService, 1);
    assert.equal(toIsoDate(leap1.anniversaryDate), '2025-02-28');

    const collabTok = (
      await apiJson(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: users.collab.email, password: 'TestCollab123!' },
      })
    ).data.access_token;

    const hrDirTok = (
      await apiJson(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: users.hrDirector.email, password: 'TestHr123!' },
      })
    ).data.access_token;

    const hrSpecTok = (
      await apiJson(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: users.hrSpecialist.email, password: 'TestHr123!' },
      })
    ).data.access_token;

    // Rechazo de fechas imposibles e intervalos invertidos
    for (const bad of ['2027-02-31', '2026-13-01', '2026-2-5']) {
      const r = await apiJson(baseUrl, '/api/requests', {
        method: 'POST',
        token: collabTok,
        body: { request_type: 'home_office', start_date: bad, end_date: bad },
      });
      assert.equal(r.status, 400);
    }

    // --- 1. Reconstrucción de saldos antiguos (periodo anterior vs ambiguo vs otro colaborador) ---
    // Solicitud de enero 2026 que pertenece al periodo 2025 (hireDate 2024-06-01 -> periodo 2025: 2025-06-01 a 2026-05-31)
    const bal2025 = await prisma.balance.create({
      data: {
        employeeId: users.collab.id,
        year: 2025,
        entitledDays: new Prisma.Decimal('15.00'),
        usedDays: new Prisma.Decimal('3.00'),
        pendingDays: new Prisma.Decimal('0.00'),
        availableDays: new Prisma.Decimal('12.00'),
        expirationDate: new Date('2026-05-31'),
      },
    });
    const reqPrevPeriod = await prisma.leaveRequest.create({
      data: {
        employeeId: users.collab.id,
        balanceId: balances.balCollab2026.id, // mal vinculada por YEAR(start_date)=2026 (bal2026 tiene usedDays=0!)
        requestType: 'vacaciones',
        startDate: new Date('2026-01-15'),
        endDate: new Date('2026-01-19'),
        daysCount: new Prisma.Decimal('3.00'),
        status: 'aprobada',
      },
    });

    // Solicitud antigua con vínculo ambiguo (mismo saldo insuficiente en 2025 y 2026 para 8 días usados)
    const reqAmbiguous = await prisma.leaveRequest.create({
      data: {
        employeeId: users.collab.id,
        balanceId: balances.balCollab2026.id,
        requestType: 'vacaciones',
        startDate: new Date('2026-04-10'),
        endDate: new Date('2026-04-21'),
        daysCount: new Prisma.Decimal('8.00'),
        status: 'aprobada',
      },
    });

    // Solicitud vinculada por error al saldo de otro colaborador
    const reqWrongOwner = await prisma.leaveRequest.create({
      data: {
        employeeId: users.collab.id,
        balanceId: balances.balOther2026.id,
        requestType: 'vacaciones',
        startDate: new Date('2026-08-03'),
        endDate: new Date('2026-08-05'),
        daysCount: new Prisma.Decimal('3.00'),
        status: 'pendiente',
      },
    });

    const preview = await reconcileRequestBalances(prisma, { apply: false });
    assert.ok(preview.changes.some((c) => c.requestId === reqPrevPeriod.id && c.toBalanceId === bal2025.id));
    assert.ok(preview.ambiguousCases.some((a) => a.requestId === reqAmbiguous.id));
    assert.ok(preview.ambiguousCases.some((a) => a.requestId === reqWrongOwner.id));

    const applied = await reconcileRequestBalances(prisma, { apply: true });
    assert.ok(applied.appliedCount >= 3);

    const [afterPrev, afterAmb, afterWrong] = await Promise.all([
      prisma.leaveRequest.findUnique({ where: { id: reqPrevPeriod.id } }),
      prisma.leaveRequest.findUnique({ where: { id: reqAmbiguous.id } }),
      prisma.leaveRequest.findUnique({ where: { id: reqWrongOwner.id } }),
    ]);
    assert.equal(afterPrev.balanceId, bal2025.id); // Periodo anterior 2025 reconstruido correctamente
    assert.equal(afterAmb.balanceId, null); // Caso ambiguo conservado sin asignación arbitraria
    assert.equal(afterWrong.balanceId, null); // Saldo ajeno desvinculado

    // Intentar usar balance_id de otro colaborador desde la API -> 409 sin cambios
    const crossOwnerApi = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: collabTok,
      body: {
        request_type: 'vacaciones',
        balance_id: balances.balOther2026.id,
        start_date: '2027-02-01',
        end_date: '2027-02-02',
      },
    });
    assert.equal(crossOwnerApi.status, 409);

    // --- 2. Idempotencia persistente en MySQL (concurrente, secuencial, contenido distinto, reinicio, rollback) ---
    const idemKey = `req-idem-${Date.now()}`;
    const payloadA = {
      request_type: 'vacaciones',
      balance_id: balances.balCollab2026.id,
      start_date: '2027-03-08',
      end_date: '2027-03-10',
      reason: 'Prueba idempotencia persistente',
    };

    // Dos peticiones simultáneas con la misma clave -> 1 solicitud creada, saldo reservado 1 sola vez (3 días)
    const [sim1, sim2] = await Promise.all([
      apiJson(baseUrl, '/api/requests', {
        method: 'POST',
        token: collabTok,
        headers: { 'X-Idempotency-Key': idemKey },
        body: payloadA,
      }),
      apiJson(baseUrl, '/api/requests', {
        method: 'POST',
        token: collabTok,
        headers: { 'X-Idempotency-Key': idemKey },
        body: payloadA,
      }),
    ]);
    assert.equal(sim1.status, 200);
    assert.equal(sim2.status, 200);
    assert.equal(sim1.data.id, sim2.data.id);

    const balAfterSim = await prisma.balance.findUnique({ where: { id: balances.balCollab2026.id } });
    assert.equal(Number(balAfterSim.pendingDays), 3);
    assert.equal(Number(balAfterSim.availableDays), 12);

    // Misma clave con contenido diferente -> 409 Conflict
    const diffPayload = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: collabTok,
      headers: { 'X-Idempotency-Key': idemKey },
      body: { ...payloadA, end_date: '2027-03-11' },
    });
    assert.equal(diffPayload.status, 409);

    // Simular reinicio del servidor / nueva instancia de Express leyendo desde MySQL `idempotency_records`
    const { createApp } = await import(`../src/app.js?restarted=${Date.now()}`);
    const restartedServer = http.createServer(createApp());
    const restartedUrl = await new Promise((resolve) => {
      restartedServer.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${restartedServer.address().port}`);
      });
    });
    try {
      const replayAfterRestart = await apiJson(restartedUrl, '/api/requests', {
        method: 'POST',
        token: collabTok,
        headers: { 'X-Idempotency-Key': idemKey },
        body: payloadA,
      });
      assert.equal(replayAfterRestart.status, 200);
      assert.equal(replayAfterRestart.data.id, sim1.data.id);
    } finally {
      await new Promise((resolve) => restartedServer.close(resolve));
    }

    // Fallo transaccional sin reserva parcial (saldo insuficiente para 20 días)
    const failKey = `req-fail-${Date.now()}`;
    const failReq = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: collabTok,
      headers: { 'X-Idempotency-Key': failKey },
      body: {
        request_type: 'vacaciones',
        balance_id: balances.balCollab2026.id,
        start_date: '2027-04-05',
        end_date: '2027-04-30',
      },
    });
    assert.equal(failReq.status, 400);
    const balAfterFail = await prisma.balance.findUnique({ where: { id: balances.balCollab2026.id } });
    assert.equal(Number(balAfterFail.pendingDays), 3);
    assert.equal(Number(balAfterFail.availableDays), 12);
    const idemFailCount = await prisma.idempotencyRecord.count({ where: { idempotencyKey: failKey } });
    assert.equal(idemFailCount, 0);

    // --- 3. Reasignación de tickets sensibles y permisos ---
    const sens = await apiJson(baseUrl, '/api/tickets', {
      method: 'POST',
      token: collabTok,
      body: {
        topic: 'Ticket sensible aislado',
        confirmed_summary: 'Prueba de reasignación y permisos en base aislada.',
        is_sensitive: true,
      },
    });
    assert.equal(sens.status, 200);
    assert.equal(sens.data.assignee_id, users.hrDirector.id);

    const reassign = await apiJson(baseUrl, `/api/tickets/${sens.data.id}`, {
      method: 'PATCH',
      token: hrDirTok,
      body: { status: 'en_proceso', notes: 'Asignado a especialista', assignee_id: users.hrSpecialist.id },
    });
    assert.equal(reassign.status, 200);
    assert.equal(reassign.data.assignee_id, users.hrSpecialist.id);

    const specList = await apiJson(baseUrl, '/api/tickets', { token: hrSpecTok });
    assert.ok(specList.data.some((t) => t.id === sens.data.id));
  } finally {
    await env.cleanup();
  }

  // Verificar que la base habitual del portal permaneció 100% intacta tras ejecutar y limpiar la suite
  const afterProd = {
    requests: await prodReader.leaveRequest.count(),
    idem: await prodReader.idempotencyRecord.count(),
    anaBal: await prodReader.balance.findFirst({
      where: { employee: { email: 'ana.garcia@nubera.mx' } },
      orderBy: { year: 'desc' },
      select: { usedDays: true, pendingDays: true, availableDays: true },
    }),
  };
  await prodReader.$disconnect();

  assert.equal(afterProd.requests, beforeProd.requests);
  assert.equal(afterProd.idem, beforeProd.idem);
  assert.deepEqual(afterProd.anaBal, beforeProd.anaBal);
});

test('Dos ejecuciones independientes concurrentes en bases temporales distintas no colisionan', async () => {
  const [env1, env2] = await Promise.all([
    createIsolatedTestEnv({ tag: 'p1' }),
    createIsolatedTestEnv({ tag: 'p2' }),
  ]);

  try {
    assert.notEqual(env1.dbName, env2.dbName);
    const [h1, h2] = await Promise.all([
      apiJson(env1.baseUrl, '/api/health'),
      apiJson(env2.baseUrl, '/api/health'),
    ]);
    assert.equal(h1.status, 200);
    assert.equal(h2.status, 200);
  } finally {
    await Promise.all([env1.cleanup(), env2.cleanup()]);
  }
});
