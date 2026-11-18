import test from 'node:test';
import assert from 'node:assert/strict';
import { createIsolatedTestEnv } from './helpers/isolatedDb.js';

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

test('Stage 3 (Isolated DB): Auth, RBAC, /api/me/data, Requests concurrency, Tickets transaction', async () => {
  const env = await createIsolatedTestEnv({ tag: 'stage3' });
  const { prisma, baseUrl, users, balances } = env;

  try {
    // 1. Login colaborador y RRHH con fixtures propios de la base aislada
    const collabLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: users.collab.email, password: 'TestCollab123!' },
    });
    assert.equal(collabLogin.status, 200);
    assert.ok(collabLogin.data.access_token);
    assert.equal(collabLogin.data.user.role, 'colaborador');
    const collabToken = collabLogin.data.access_token;

    const hrLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: users.hrDirector.email, password: 'TestHr123!' },
    });
    assert.equal(hrLogin.status, 200);
    assert.equal(hrLogin.data.user.role, 'rrhh');
    const hrToken = hrLogin.data.access_token;

    // 2. /api/auth/me y /api/me/data
    const meRes = await apiJson(baseUrl, '/api/auth/me', { token: collabToken });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.email, users.collab.email);

    const myData = await apiJson(baseUrl, '/api/me/data', { token: collabToken });
    assert.equal(myData.status, 200);
    assert.equal(myData.data.balances[0].entitled_days, 15);
    assert.equal(myData.data.balances[0].used_days, 2);
    assert.equal(myData.data.balances[0].pending_days, 3);
    assert.equal(myData.data.balances[0].available_days, 10);
    assert.ok(myData.data.balances[0].six_month_deadline);
    assert.equal(typeof myData.data.balances[0].is_deadline_expired, 'boolean');
    assert.ok(myData.data.payment_schedule_info.projected_date);

    // 3. RBAC: colaborador no puede listar todas las solicitudes ni todos los tickets ni aprobar
    const rbacReq = await apiJson(baseUrl, '/api/requests', { token: collabToken });
    assert.equal(rbacReq.status, 403);
    const rbacTkt = await apiJson(baseUrl, '/api/tickets', { token: collabToken });
    assert.equal(rbacTkt.status, 403);

    // 4. Regla RH-01: vacaciones sin 10 días hábiles de anticipación -> 400
    const shortLead = await apiJson(baseUrl, '/api/requests', {
      method: 'POST',
      token: collabToken,
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
      token: collabToken,
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

    // Verificar reserva de saldo tras crear (pending 3 + 2 = 5, available 10 - 2 = 8)
    const afterCreateBal = await prisma.balance.findUnique({ where: { id: balances.balCollab2026.id } });
    assert.equal(Number(afterCreateBal.pendingDays), 5);
    assert.equal(Number(afterCreateBal.availableDays), 8);

    // Colaborador intentando aprobar su propia solicitud -> 403
    const collabApprove = await apiJson(baseUrl, `/api/requests/${createReq.data.id}`, {
      method: 'PATCH',
      token: collabToken,
      body: { status: 'aprobada' },
    });
    assert.equal(collabApprove.status, 403);

    // Concurrencia: RRHH aprueba y rechaza al mismo tiempo; solo una gana (200) y la otra recibe 409
    const [r1, r2] = await Promise.all([
      apiJson(baseUrl, `/api/requests/${createReq.data.id}`, {
        method: 'PATCH',
        token: hrToken,
        body: { status: 'aprobada', approver_notes: 'Aprobada en prueba' },
      }),
      apiJson(baseUrl, `/api/requests/${createReq.data.id}`, {
        method: 'PATCH',
        token: hrToken,
        body: { status: 'rechazada', approver_notes: 'Conflicto concurrente' },
      }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [200, 409]);

    // 6. Tickets: crear ticket sensible e historial inicial en transacción
    const createTkt = await apiJson(baseUrl, '/api/tickets', {
      method: 'POST',
      token: collabToken,
      body: {
        topic: 'Prueba Etapa 3 Ticket',
        confirmed_summary: 'Resumen de prueba transaccional para ticket sensible en Express + Prisma.',
        is_sensitive: true,
      },
    });
    assert.equal(createTkt.status, 200);
    assert.equal(createTkt.data.assigned_to, 'Laura Patricia Mendoza Ortega');
    assert.equal(createTkt.data.history.length, 1);

    const mineTkts = await apiJson(baseUrl, '/api/tickets/mine', { token: collabToken });
    assert.equal(mineTkts.status, 200);
    assert.ok(mineTkts.data.some((t) => t.id === createTkt.data.id));

    const updateTkt = await apiJson(baseUrl, `/api/tickets/${createTkt.data.id}`, {
      method: 'PATCH',
      token: hrToken,
      body: { status: 'en_proceso', notes: 'Atendiendo en prueba de integración.' },
    });
    assert.equal(updateTkt.status, 200);
    assert.equal(updateTkt.data.status, 'en_proceso');
    assert.equal(updateTkt.data.history.length, 2);

    // 7. Logout revoca el token
    const logoutRes = await apiJson(baseUrl, '/api/auth/logout', { method: 'POST', token: collabToken });
    assert.equal(logoutRes.status, 200);
    const revokedMe = await apiJson(baseUrl, '/api/auth/me', { token: collabToken });
    assert.equal(revokedMe.status, 401);
  } finally {
    await env.cleanup();
  }
});
