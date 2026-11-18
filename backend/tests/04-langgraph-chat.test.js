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
  return { status: res.status, data: await res.json(), headers: res.headers };
}

test('Stage 5: LangGraph.js multi-agent routing, citations, RBAC, no-backing & conversation isolation', async () => {
  const { server, baseUrl } = await startTestServer();
  const testSession = `stage5-${Date.now()}`;
  let anaId = null;

  try {
    const anaLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'ana.garcia@nubera.mx', password: 'Colaborador123!' },
    });
    assert.equal(anaLogin.status, 200);
    const anaToken = anaLogin.data.access_token;
    anaId = anaLogin.data.user.id;

    const lauraLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'laura.mendoza@nubera.mx', password: 'Rrhh123!' },
    });
    assert.equal(lauraLogin.status, 200);
    const lauraToken = lauraLogin.data.access_token;

    // 1. Mixta: Ana consulta cuántos días le quedan y si puede usarlos el próximo año
    const mixed = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: anaToken,
      body: {
        question: '¿Cuántos días me quedan y puedo usarlos el próximo año?',
        session_id: testSession,
      },
    });
    assert.equal(mixed.status, 200);
    assert.equal(mixed.data.intent, 'mixta');
    assert.ok(mixed.headers.get('x-trace-id'));
    assert.ok(mixed.data.answer.includes('10'));
    assert.match(mixed.data.answer, /venci[oó]|vencido/i);
    assert.match(mixed.data.answer, /RRHH/i);
    assert.ok(!/sí es posible|puedes usarlos el próximo año/i.test(mixed.data.answer));
    assert.ok(mixed.data.citations.length >= 1);
    assert.equal(mixed.data.outcome, 'resuelta');
    assert.equal(mixed.data.needs_hr_escalation, true);
    assert.ok(mixed.data.suggested_ticket_summary);

    // 2. Dato personal: próximo pago
    const pay = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: anaToken,
      body: { question: '¿Cuál es mi próxima fecha de pago?', session_id: testSession },
    });
    assert.equal(pay.status, 200);
    assert.equal(pay.data.intent, 'dato_personal');
    assert.equal(pay.data.outcome, 'resuelta');

    // 3. Política pura con cita
    const pol = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: anaToken,
      body: { question: '¿Con cuántos días de anticipación se piden las vacaciones?', session_id: testSession },
    });
    assert.equal(pol.status, 200);
    assert.equal(pol.data.intent, 'politica');
    assert.ok(pol.data.citations.length >= 1);
    assert.equal(pol.data.outcome, 'resuelta');

    // 4. Sin respaldo documental -> escalación sugerida
    const noBack = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: anaToken,
      body: { question: '¿Tenemos bono por adopción de mascotas?', session_id: testSession },
    });
    assert.equal(noBack.status, 200);
    assert.equal(noBack.data.outcome, 'escalada_rrhh');
    assert.equal(noBack.data.needs_hr_escalation, true);
    assert.ok(noBack.data.suggested_ticket_summary);

    // 5. Restringida (datos de terceros) y Reporte denegado a colaborador
    const thirdParty = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: anaToken,
      body: { question: '¿Cuántos días de vacaciones le quedan a Carlos Ramírez?', session_id: testSession },
    });
    assert.equal(thirdParty.status, 200);
    assert.equal(thirdParty.data.intent, 'restringida');
    assert.equal(thirdParty.data.outcome, 'denegada');

    const repDenied = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: anaToken,
      body: { question: 'Dame los indicadores de RRHH y ausencias de hoy', session_id: testSession },
    });
    assert.equal(repDenied.status, 200);
    assert.equal(repDenied.data.intent, 'reporte');
    assert.equal(repDenied.data.outcome, 'denegada');

    // Reporte permitido para RRHH
    const repOk = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: lauraToken,
      body: { question: 'Dame el resumen ejecutivo del reporte diario', session_id: testSession },
    });
    assert.equal(repOk.status, 200);
    assert.equal(repOk.data.intent, 'reporte');
    assert.equal(repOk.data.outcome, 'resuelta');

    // 6. Conversaciones, historial y feedback aislados por usuario
    const convs = await apiJson(baseUrl, '/api/chat/conversations', { token: anaToken });
    assert.equal(convs.status, 200);
    const fullConvId = `${anaId}:${testSession}`;
    assert.ok(convs.data.some((c) => c.id === fullConvId));

    const hist = await apiJson(baseUrl, `/api/chat/history?session_id=${encodeURIComponent(fullConvId)}`, {
      token: anaToken,
    });
    assert.equal(hist.status, 200);
    assert.equal(hist.data.length, 6);

    const fb = await apiJson(baseUrl, `/api/chat/${mixed.data.id}/feedback`, {
      method: 'POST',
      token: anaToken,
      body: { helpful: true },
    });
    assert.equal(fb.status, 200);
    assert.equal(fb.data.helpful, true);

    // Laura no puede dar feedback a un log de Ana
    const fbOther = await apiJson(baseUrl, `/api/chat/${mixed.data.id}/feedback`, {
      method: 'POST',
      token: lauraToken,
      body: { helpful: false },
    });
    assert.equal(fbOther.status, 404);
  } finally {
    const convIds = [`${anaId}:${testSession}`];
    const lauraRow = await prisma.employee.findUnique({ where: { email: 'laura.mendoza@nubera.mx' }, select: { id: true } });
    if (lauraRow) convIds.push(`${lauraRow.id}:${testSession}`);
    await prisma.chatLog.deleteMany({ where: { sessionId: { in: convIds } } });
    await prisma.chatConversation.deleteMany({ where: { id: { in: convIds } } });
    await prisma.$disconnect();
    await new Promise((resolve) => server.close(resolve));
  }
});
