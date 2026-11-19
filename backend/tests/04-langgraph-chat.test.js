import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { createIsolatedTestEnv } from './helpers/isolatedDb.js';
import { syncDrivePolicies } from '../src/agents/ingestionAgent.js';

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

test('Stage 5 (Isolated DB): LangGraph.js multi-agent routing, citations, RBAC, no-backing & conversation isolation', async () => {
  const env = await createIsolatedTestEnv({ tag: 'stage5' });
  const { prisma, baseUrl, users } = env;
  const testSession = `stage5-${Date.now()}`;

  try {
    // Sembrar políticas mínimas y reporte diario en la base temporal aislada
    await syncDrivePolicies(prisma, {
      deleteMissing: false,
      overrideDocs: [
        {
          drive_file_id: 'stage5-rh01',
          policy_code: 'RH-01',
          title: 'RH-01 Vacaciones y descansos obligatorios',
          mime_type: 'application/vnd.google-apps.document',
          version: '1.1',
          effective_date: '2026-11-17',
          owner: 'Operaciones de RRHH',
          drive_url: 'https://drive.google.com/file/d/stage5-rh01/view',
          sections: [
            {
              section: 'Solicitud y anticipación',
              content:
                'Solicita las fechas en el portal con 10 días hábiles de anticipación como regla administrativa. ' +
                'Las vacaciones deben concederse dentro de los seis meses posteriores al aniversario. ' +
                'Nubera otorga 15 días laborables al primer aniversario y una prima interna del 30 %. ' +
                'RRHH revisa los saldos pendientes para agendar su disfrute.',
            },
          ],
        },
        {
          drive_file_id: 'stage5-rh12',
          policy_code: 'RH-12',
          title: 'Nubera Digital | Calendarios de RRHH 2026',
          mime_type: 'application/vnd.google-apps.spreadsheet',
          version: '1.1',
          effective_date: '2026-01-01',
          owner: 'Nómina',
          drive_url: 'https://drive.google.com/file/d/stage5-rh12/view',
          sections: [
            {
              section: 'Pestaña: Pagos 2026',
              content: 'Pago semanal | 2026-11-20 | Programado | Nómina',
            },
          ],
        },
      ],
    });

    await prisma.dailyReport.create({
      data: {
        reportDate: new Date('2026-11-18T00:00:00.000Z'),
        absencesToday: 2,
        pendingRequests: 3,
        pendingOver3Days: 1,
        activeDisabilities: 1,
        resolvedWithoutEscalationPct: new Prisma.Decimal('95.00'),
        monthlyDisabilityDays: 4,
        monthlyHires: 1,
        monthlyExits: 0,
        turnoverRatePct: new Prisma.Decimal('0.00'),
        employeesOver20VacationDays: 0,
        prevDayChatVolume: 5,
        prevDayAvgLatencyMs: 120,
        payloadJson: { absences_by_type: [], top_5_topics: [] },
        executiveSummary: 'Reporte aislado de prueba: 2 ausencias hoy y 3 solicitudes pendientes.',
      },
    });

    const collabLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: users.collab.email, password: 'TestCollab123!' },
    });
    assert.equal(collabLogin.status, 200);
    const collabToken = collabLogin.data.access_token;
    const collabId = collabLogin.data.user.id;

    const hrLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: users.hrDirector.email, password: 'TestHr123!' },
    });
    assert.equal(hrLogin.status, 200);
    const hrToken = hrLogin.data.access_token;

    // 1. Mixta: colaborador consulta cuántos días le quedan y si puede usarlos el próximo año
    const mixed = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: collabToken,
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
      token: collabToken,
      body: { question: '¿Cuál es mi próxima fecha de pago?', session_id: testSession },
    });
    assert.equal(pay.status, 200);
    assert.equal(pay.data.intent, 'dato_personal');
    assert.equal(pay.data.outcome, 'resuelta');

    // 3. Política pura con cita
    const pol = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: collabToken,
      body: { question: '¿Con cuántos días de anticipación se piden las vacaciones?', session_id: testSession },
    });
    assert.equal(pol.status, 200);
    assert.equal(pol.data.intent, 'politica');
    assert.ok(pol.data.citations.length >= 1);
    assert.equal(pol.data.outcome, 'resuelta');

    // 3b. Seguimiento corto conserva contexto de conversación sin error de validación
    const shortFollowUp = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: collabToken,
      body: { question: '?', session_id: testSession },
    });
    assert.equal(shortFollowUp.status, 200);
    assert.equal(shortFollowUp.data.outcome, 'resuelta');

    // 4. Sin respaldo documental -> escalación sugerida
    const noBack = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: collabToken,
      body: { question: '¿Tenemos bono por adopción de mascotas?', session_id: testSession },
    });
    assert.equal(noBack.status, 200);
    assert.equal(noBack.data.outcome, 'escalada_rrhh');
    assert.equal(noBack.data.needs_hr_escalation, true);
    assert.ok(noBack.data.suggested_ticket_summary);

    // 5. Restringida (datos de terceros) y Reporte denegado a colaborador
    const thirdParty = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: collabToken,
      body: { question: '¿Cuántos días de vacaciones le quedan a Carlos Ramírez?', session_id: testSession },
    });
    assert.equal(thirdParty.status, 200);
    assert.equal(thirdParty.data.intent, 'restringida');
    assert.equal(thirdParty.data.outcome, 'denegada');

    const repDenied = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: collabToken,
      body: { question: 'Dame los indicadores de RRHH y ausencias de hoy', session_id: testSession },
    });
    assert.equal(repDenied.status, 200);
    assert.equal(repDenied.data.intent, 'reporte');
    assert.equal(repDenied.data.outcome, 'denegada');

    // Reporte permitido para RRHH
    const repOk = await apiJson(baseUrl, '/api/chat', {
      method: 'POST',
      token: hrToken,
      body: { question: 'Dame el resumen ejecutivo del reporte diario', session_id: testSession },
    });
    assert.equal(repOk.status, 200);
    assert.equal(repOk.data.intent, 'reporte');
    assert.equal(repOk.data.outcome, 'resuelta');

    // 6. Conversaciones, historial y feedback aislados por usuario
    const convs = await apiJson(baseUrl, '/api/chat/conversations', { token: collabToken });
    assert.equal(convs.status, 200);
    const fullConvId = `${collabId}:${testSession}`;
    assert.ok(convs.data.some((c) => c.id === fullConvId));

    const hist = await apiJson(baseUrl, `/api/chat/history?session_id=${encodeURIComponent(fullConvId)}`, {
      token: collabToken,
    });
    assert.equal(hist.status, 200);
    assert.equal(hist.data.length, 7);

    const fb = await apiJson(baseUrl, `/api/chat/${mixed.data.id}/feedback`, {
      method: 'POST',
      token: collabToken,
      body: { helpful: true },
    });
    assert.equal(fb.status, 200);
    assert.equal(fb.data.helpful, true);

    // RRHH no puede dar feedback a un log de otro colaborador
    const fbOther = await apiJson(baseUrl, `/api/chat/${mixed.data.id}/feedback`, {
      method: 'POST',
      token: hrToken,
      body: { helpful: false },
    });
    assert.equal(fbOther.status, 404);
  } finally {
    await env.cleanup();
  }
});
