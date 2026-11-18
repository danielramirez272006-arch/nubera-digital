import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

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

async function apiJson(baseUrl, path, { method = 'GET', token = null, body = undefined } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, data: json };
}

test('Stage 3: Auth, RBAC, /api/me/data, Requests concurrency, Tickets transaction', async () => {
  const { server, baseUrl } = await startTestServer();
  const createdRequestIds = [];
  const createdTicketIds = [];
  let anaId;
  let initialBalanceSnapshot = null;

  try {
    // 1. Login colaborador (Ana) y RRHH (Laura)
    const anaLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'ana.garcia@nubera.mx', password: 'Colaborador123!' },
    });
    assert.equal(anaLogin.status, 200);
    assert.ok(anaLogin.data.access_token);
    assert.equal(anaLogin.data.user.role, 'colaborador');
    const anaToken = anaLogin.data.access_token;
    anaId = anaLogin.data.user.id;

    const lauraLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'laura.mendoza@nubera.mx', password: 'Rrhh123!' },
    });
    assert.equal(lauraLogin.status, 200);
    assert.equal(lauraLogin.data.user.role, 'rrhh');
    const lauraToken = lauraLogin.data.access_token;

    // Guardar snapshot de saldo de Ana para restaurar al final
    const balRow = await prisma.balance.findFirst({
      where: { employeeId: anaId },
      orderBy: { year: 'desc' },
    });
    assert.ok(balRow);
    initialBalanceSnapshot = {
      id: balRow.id,
      usedDays: balRow.usedDays,
      pendingDays: balRow.pendingDays,
      availableDays: balRow.availableDays,
    };

    // 2. /api/auth/me y /api/me/data
    const meRes = await apiJson(baseUrl, '/api/auth/me', { token: anaToken });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.email, 'ana.garcia@nubera.mx');

    const myData = await apiJson(baseUrl, '/api/me/data', { token: anaToken });
    assert.equal(myData.status, 200);
    assert.equal(myData.data.balances[0].entitled_days, 15);
    assert.equal(myData.data.balances[0].used_days, 2);
    assert.equal(myData.data.balances[0].pending_days, 3);
    assert.equal(myData.data.balances[0].available_days, 10);
    assert.ok(myData.data.balances[0].six_month_deadline);
    assert.equal(typeof myData.data.balances[0].is_deadline_expired, 'boolean');
    assert.ok(myData.data.payment_schedule_info.projected_date);

    // 3. RBAC: colaborador no puede listar todas las solicitudes ni todos los tickets ni aprobar
    const rbacReq = await apiJson(baseUrl, '/api/requests', { token: anaToken });
    assert.equal(rbacReq.status, 403);
    const rbacTkt = await apiJson(baseUrl, '/api/tickets', { token: anaToken });
    assert.equal(rbacTkt.status, 403);

    // 4. Regla RH-01: vacaciones sin 10 días hábiles de anticipación -> 400
    const shortLead = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: anaToken,
      body: {
        request_type: 'vacaciones',
        start_date: '2026-11-20',
        end_date: '2026-11-20',
        reason: 'Prueba anticipación insuficiente',
      },
    });
    assert.equal(shortLead.status, 400);

    // 5. Crear solicitud válida de vacaciones (enero 2027, 2 días hábiles: lun 11 - mar 12 ene 2027)
    const createReq = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: anaToken,
      body: {
        request_type: 'vacaciones',
        start_date: '2027-01-11',
        end_date: '2027-01-12',
        reason: 'Prueba integración Etapa 3',
      },
    });
    assert.equal(createReq.status, 200);
    assert.equal(createReq.data.days_count, 2);
    assert.equal(createReq.data.status, 'pendiente');
    createdRequestIds.push(createReq.data.id);

    // Verificar reserva de saldo tras crear (pending +2 = 6, available -2 = 7)
    const afterCreateBal = await prisma.balance.findUnique({ where: { id: balRow.id } });
    assert.equal(Number(afterCreateBal.pendingDays), Number(initialBalanceSnapshot.pendingDays) + 2);
    assert.equal(Number(afterCreateBal.availableDays), Number(initialBalanceSnapshot.availableDays) - 2);

    // Colaborador intentando aprobar su propia solicitud -> 403
    const anaApprove = await apiJson(baseUrl, `/api/requests/${createReq.data.id}`, {
      method: 'PATCH',
      token: anaToken,
      body: { status: 'aprobada' },
    });
    assert.equal(anaApprove.status, 403);

    // Concurrencia: Laura aprueba y rechaza al mismo tiempo; solo una gana (200) y la otra recibe 409
    const [r1, r2] = await Promise.all([
      apiJson(baseUrl, `/api/requests/${createReq.data.id}`, {
        method: 'PATCH',
        token: lauraToken,
        body: { status: 'aprobada', approver_notes: 'Aprobada en prueba' },
      }),
      apiJson(baseUrl, `/api/requests/${createReq.data.id}`, {
        method: 'PATCH',
        token: lauraToken,
        body: { status: 'rechazada', approver_notes: 'Conflicto concurrente' },
      }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [200, 409]);

    // 6. Tickets: crear ticket sensible e historial inicial en transacción
    const createTkt = await apiJson(baseUrl, '/api/tickets', {
      method: 'POST',
      token: anaToken,
      body: {
        topic: 'Prueba Etapa 3 Ticket',
        confirmed_summary: 'Resumen de prueba transaccional para ticket sensible en Express + Prisma.',
        is_sensitive: true,
      },
    });
    assert.equal(createTkt.status, 200);
    assert.equal(createTkt.data.assigned_to, 'Laura Patricia Mendoza Ortega');
    assert.equal(createTkt.data.history.length, 1);
    createdTicketIds.push(createTkt.data.id);

    const mineTkts = await apiJson(baseUrl, '/api/tickets/mine', { token: anaToken });
    assert.equal(mineTkts.status, 200);
    assert.ok(mineTkts.data.some((t) => t.id === createTkt.data.id));

    const updateTkt = await apiJson(baseUrl, `/api/tickets/${createTkt.data.id}`, {
      method: 'PATCH',
      token: lauraToken,
      body: { status: 'en_proceso', notes: 'Atendiendo en prueba de integración.' },
    });
    assert.equal(updateTkt.status, 200);
    assert.equal(updateTkt.data.status, 'en_proceso');
    assert.equal(updateTkt.data.history.length, 2);

    // 7. Logout revoca el token
    const logoutRes = await apiJson(baseUrl, '/api/auth/logout', { method: 'POST', token: anaToken });
    assert.equal(logoutRes.status, 200);
    const revokedMe = await apiJson(baseUrl, '/api/auth/me', { token: anaToken });
    assert.equal(revokedMe.status, 401);
  } finally {
    if (createdTicketIds.length) {
      await prisma.ticketHistory.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
      await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    }
    if (createdRequestIds.length) {
      await prisma.leaveRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
    }
    if (initialBalanceSnapshot) {
      await prisma.balance.update({
        where: { id: initialBalanceSnapshot.id },
        data: {
          usedDays: initialBalanceSnapshot.usedDays,
          pendingDays: initialBalanceSnapshot.pendingDays,
          availableDays: initialBalanceSnapshot.availableDays,
        },
      });
    }
    await prisma.$disconnect();
    await new Promise((resolve) => server.close(resolve));
  }
});
