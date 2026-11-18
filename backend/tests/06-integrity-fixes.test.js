import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Prisma } from '@prisma/client';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { computeVacationEntitlement, isValidIsoDate, parseIsoDateUtc, toIsoDate } from '../src/services/vacationRules.js';

function startTestServer() {
  const app = createApp();
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function apiJson(baseUrl, path, { method = 'GET', token = null, body = undefined, headers: extraHeaders = {} } = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

test('Integrity 1-4: Balance link, invariants/rollback, ticket reassignment RBAC & real dates', async () => {
  const { server, baseUrl } = await startTestServer();
  const createdReqIds = [];
  const createdTicketIds = [];
  let extraBalanceId = null;
  let anaBalSnapshot = null;

  try {
    // --- 4. Validación estricta de fechas reales y años bisiestos ---
    assert.equal(isValidIsoDate('2027-02-31'), false);
    assert.equal(isValidIsoDate('2026-13-01'), false);
    assert.equal(isValidIsoDate('2025-02-29'), false);
    assert.equal(isValidIsoDate('2026-2-5'), false);
    assert.equal(isValidIsoDate('2026-00-10'), false);
    assert.equal(isValidIsoDate('2024-02-29'), true);
    assert.equal(isValidIsoDate('2028-02-29'), true);
    assert.throws(() => parseIsoDateUtc('2027-02-31'));

    const leapAnniv = computeVacationEntitlement(parseIsoDateUtc('2024-02-29'), parseIsoDateUtc('2025-02-28'));
    assert.equal(leapAnniv.yearsOfService, 0);
    const leapAnniv1 = computeVacationEntitlement(parseIsoDateUtc('2024-02-29'), parseIsoDateUtc('2025-03-01'));
    assert.equal(leapAnniv1.yearsOfService, 1);
    assert.equal(toIsoDate(leapAnniv1.anniversaryDate), '2025-02-28');

    const anaLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'ana.garcia@nubera.mx', password: 'Colaborador123!' },
    });
    const lauraLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'laura.mendoza@nubera.mx', password: 'Rrhh123!' },
    });
    const diegoLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'diego.santos@nubera.mx', password: 'Rrhh123!' },
    });
    assert.equal(anaLogin.status, 200);
    assert.equal(lauraLogin.status, 200);
    assert.equal(diegoLogin.status, 200);

    const anaToken = anaLogin.data.access_token;
    const lauraToken = lauraLogin.data.access_token;
    const diegoToken = diegoLogin.data.access_token;
    const anaId = anaLogin.data.user.id;
    const lauraId = lauraLogin.data.user.id;
    const diegoId = diegoLogin.data.user.id;

    // Fechas imposibles rechazadas por Zod en API
    for (const badDate of ['2027-02-31', '2026-13-01', '2026-2-5', '2025-02-29']) {
      const badReq = await apiJson(baseUrl, '/api/requests', {
        method: 'POST',
        token: anaToken,
        body: { request_type: 'home_office', start_date: badDate, end_date: badDate },
      });
      assert.equal(badReq.status, 400);

      const badDash = await apiJson(baseUrl, `/api/dashboard/report?report_date=${badDate}`, {
        token: lauraToken,
      });
      assert.equal(badDash.status, 400);
    }

    // --- 1 & 2. Vínculo explícito solicitud-saldo, idempotencia de creación y rollback ---
    const bal2026 = await prisma.balance.findFirst({
      where: { employeeId: anaId, year: 2026 },
    });
    anaBalSnapshot = {
      id: bal2026.id,
      usedDays: bal2026.usedDays,
      pendingDays: bal2026.pendingDays,
      availableDays: bal2026.availableDays,
    };

    // Crear segundo periodo (2027) para comprobar que la resolución actualiza el balance_id vinculado (2026) y NO el más reciente (2027)
    const bal2027 = await prisma.balance.create({
      data: {
        employeeId: anaId,
        year: 2027,
        entitledDays: new Prisma.Decimal('16.00'),
        usedDays: new Prisma.Decimal('0.00'),
        pendingDays: new Prisma.Decimal('0.00'),
        availableDays: new Prisma.Decimal('16.00'),
        expirationDate: new Date('2027-11-11'),
      },
    });
    extraBalanceId = bal2027.id;

    // Solicitud de vacaciones vinculada explícitamente al saldo 2026 + clave de idempotencia
    const idemKey = `idem-${Date.now()}`;
    const vacCreate1 = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: anaToken,
      headers: { 'X-Idempotency-Key': idemKey },
      body: {
        request_type: 'vacaciones',
        balance_id: bal2026.id,
        start_date: '2027-02-08',
        end_date: '2027-02-09',
        reason: 'Prueba vínculo balance_id',
      },
    });
    assert.equal(vacCreate1.status, 200);
    assert.equal(vacCreate1.data.balance_id, bal2026.id);
    createdReqIds.push(vacCreate1.data.id);

    // Reintento con misma clave de idempotencia -> mismo ID, sin doble descuento
    const vacRetry = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: anaToken,
      headers: { 'X-Idempotency-Key': idemKey },
      body: {
        request_type: 'vacaciones',
        balance_id: bal2026.id,
        start_date: '2027-02-08',
        end_date: '2027-02-09',
      },
    });
    assert.equal(vacRetry.status, 200);
    assert.equal(vacRetry.data.id, vacCreate1.data.id);

    // Reintento duplicado sin clave de idempotencia -> 409 Conflict
    const vacDup = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: anaToken,
      body: {
        request_type: 'vacaciones',
        balance_id: bal2026.id,
        start_date: '2027-02-08',
        end_date: '2027-02-09',
      },
    });
    assert.equal(vacDup.status, 409);

    // Al aprobar, se actualiza bal2026 (vinculado) y bal2027 permanece intacto (0 used, 16 avail)
    const approveVac = await apiJson(baseUrl, `/api/requests/${vacCreate1.data.id}`, {
      method: 'PATCH',
      token: lauraToken,
      body: { status: 'aprobada' },
    });
    assert.equal(approveVac.status, 200);

    const [after2026, after2027] = await Promise.all([
      prisma.balance.findUnique({ where: { id: bal2026.id } }),
      prisma.balance.findUnique({ where: { id: bal2027.id } }),
    ]);
    assert.equal(Number(after2026.usedDays), Number(anaBalSnapshot.usedDays) + 2);
    assert.equal(Number(after2026.pendingDays), Number(anaBalSnapshot.pendingDays));
    assert.equal(Number(after2027.usedDays), 0);
    assert.equal(Number(after2027.availableDays), 16);

    // Solicitud no vacacional conserva balance_id null
    const hoCreate = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: anaToken,
      body: {
        request_type: 'home_office',
        start_date: '2027-02-15',
        end_date: '2027-02-15',
      },
    });
    assert.equal(hoCreate.status, 200);
    assert.equal(hoCreate.data.balance_id, null);
    createdReqIds.push(hoCreate.data.id);

    // Rollback ante inconsistencia: solicitud de vacaciones sin balance_id (caso ambiguo) -> 409 y sigue pendiente
    const orphanVac = await prisma.leaveRequest.create({
      data: {
        employeeId: anaId,
        balanceId: null,
        requestType: 'vacaciones',
        startDate: new Date('2027-03-01'),
        endDate: new Date('2027-03-01'),
        daysCount: new Prisma.Decimal('1.00'),
        status: 'pendiente',
      },
    });
    createdReqIds.push(orphanVac.id);

    const orphanApprove = await apiJson(baseUrl, `/api/requests/${orphanVac.id}`, {
      method: 'PATCH',
      token: lauraToken,
      body: { status: 'aprobada' },
    });
    assert.equal(orphanApprove.status, 409);
    const orphanAfter = await prisma.leaveRequest.findUnique({ where: { id: orphanVac.id } });
    assert.equal(orphanAfter.status, 'pendiente');

    // --- 3. Reasignación de tickets por assignee_id y permisos de tickets sensibles ---
    const sensTkt = await apiJson(baseUrl, '/api/tickets', {
      method: 'POST',
      token: anaToken,
      body: {
        topic: 'Reasignación sensible',
        confirmed_summary: 'Prueba de reasignación de ticket sensible entre responsables de RRHH.',
        is_sensitive: true,
      },
    });
    assert.equal(sensTkt.status, 200);
    assert.equal(sensTkt.data.assignee_id, lauraId);
    createdTicketIds.push(sensTkt.data.id);

    // No se puede asignar a un colaborador sin rol rrhh
    const badAssign = await apiJson(baseUrl, `/api/tickets/${sensTkt.data.id}`, {
      method: 'PATCH',
      token: lauraToken,
      body: { status: 'en_proceso', notes: 'Intento inválido', assignee_id: anaId },
    });
    assert.equal(badAssign.status, 400);

    // Diego aún no puede ver ni modificar el ticket sensible asignado a Laura
    const diegoDenied = await apiJson(baseUrl, `/api/tickets/${sensTkt.data.id}`, {
      method: 'PATCH',
      token: diegoToken,
      body: { status: 'en_proceso', notes: 'Sin permiso aún' },
    });
    assert.equal(diegoDenied.status, 403);

    // Laura reasigna el ticket sensible a Diego usando assignee_id
    const reassigned = await apiJson(baseUrl, `/api/tickets/${sensTkt.data.id}`, {
      method: 'PATCH',
      token: lauraToken,
      body: { status: 'en_proceso', notes: 'Transferido a Diego', assignee_id: diegoId },
    });
    assert.equal(reassigned.status, 200);
    assert.equal(reassigned.data.assignee_id, diegoId);
    assert.equal(reassigned.data.assigned_to, 'Diego Alejandro Santos Rivera');

    // Ahora Diego SÍ puede verlo y actualizarlo
    const diegoList = await apiJson(baseUrl, '/api/tickets', { token: diegoToken });
    assert.ok(diegoList.data.some((t) => t.id === sensTkt.data.id));
    const diegoUpdate = await apiJson(baseUrl, `/api/tickets/${sensTkt.data.id}`, {
      method: 'PATCH',
      token: diegoToken,
      body: { status: 'resuelto', notes: 'Resuelto por Diego' },
    });
    assert.equal(diegoUpdate.status, 200);

    // Diego reasigna de vuelta a Laura (Directora); ahora Diego (no Directora) pierde visibilidad y permiso PATCH
    const backToLaura = await apiJson(baseUrl, `/api/tickets/${sensTkt.data.id}`, {
      method: 'PATCH',
      token: diegoToken,
      body: { status: 'cerrado', notes: 'Devuelto a Laura', assignee_id: lauraId },
    });
    assert.equal(backToLaura.status, 200);
    assert.equal(backToLaura.data.assignee_id, lauraId);

    const diegoListAfter = await apiJson(baseUrl, '/api/tickets', { token: diegoToken });
    assert.ok(!diegoListAfter.data.some((t) => t.id === sensTkt.data.id));
    const diegoDeniedAfter = await apiJson(baseUrl, `/api/tickets/${sensTkt.data.id}`, {
      method: 'PATCH',
      token: diegoToken,
      body: { status: 'cerrado', notes: 'Ya no asignado a Diego' },
    });
    assert.equal(diegoDeniedAfter.status, 403);
  } finally {
    if (createdTicketIds.length) {
      await prisma.ticketHistory.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
      await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    }
    if (createdReqIds.length) {
      await prisma.leaveRequest.deleteMany({ where: { id: { in: createdReqIds } } });
    }
    if (extraBalanceId) {
      await prisma.balance.deleteMany({ where: { id: extraBalanceId } });
    }
    if (anaBalSnapshot) {
      await prisma.balance.update({
        where: { id: anaBalSnapshot.id },
        data: {
          usedDays: anaBalSnapshot.usedDays,
          pendingDays: anaBalSnapshot.pendingDays,
          availableDays: anaBalSnapshot.availableDays,
        },
      });
    }
    await prisma.$disconnect();
    await new Promise((resolve) => server.close(resolve));
  }
});
