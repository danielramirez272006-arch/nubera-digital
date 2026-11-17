import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { startSchedulers, stopSchedulers } from '../src/services/scheduler.js';

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
  return { status: res.status, data: await res.json() };
}

test('Stage 6: Analyst report metrics vs SQL, home_office exclusion, idempotent upsert & cron scheduler', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const anaLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'ana.garcia@nubera.mx', password: 'Colaborador123!' },
    });
    const anaToken = anaLogin.data.access_token;

    const lauraLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'laura.mendoza@nubera.mx', password: 'Rrhh123!' },
    });
    const lauraToken = lauraLogin.data.access_token;

    // 1. RBAC dashboard
    assert.equal((await apiJson(baseUrl, '/api/dashboard/dates', { token: anaToken })).status, 403);
    assert.equal((await apiJson(baseUrl, '/api/dashboard/report', { token: anaToken })).status, 403);
    assert.equal(
      (await apiJson(baseUrl, '/api/dashboard/report/generate', { method: 'POST', token: anaToken })).status,
      403
    );

    // 2. Fechas existentes
    const datesRes = await apiJson(baseUrl, '/api/dashboard/dates', { token: lauraToken });
    assert.equal(datesRes.status, 200);
    assert.ok(Array.isArray(datesRes.data) && datesRes.data.length >= 1);

    // 3. Generar y recalcular reporte de forma idempotente para 2026-11-16
    const targetDate = '2026-11-16';
    const gen1 = await apiJson(baseUrl, `/api/dashboard/report/generate?report_date=${targetDate}`, {
      method: 'POST',
      token: lauraToken,
    });
    assert.equal(gen1.status, 200);

    const gen2 = await apiJson(baseUrl, `/api/dashboard/report/generate?report_date=${targetDate}`, {
      method: 'POST',
      token: lauraToken,
    });
    assert.equal(gen2.status, 200);
    assert.equal(gen2.data.absences_today, gen1.data.absences_today);
    assert.equal(gen2.data.pending_requests, gen1.data.pending_requests);

    // Verificar exactamente 1 fila por report_date en MySQL
    const rowCount = await prisma.dailyReport.count({
      where: { reportDate: new Date(`${targetDate}T00:00:00.000Z`) },
    });
    assert.equal(rowCount, 1);

    // 4. Validar cifras contra SQL independiente
    const sqlAbs = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT employee_id) AS cnt
      FROM leave_requests
      WHERE status = 'aprobada'
        AND request_type IN ('vacaciones', 'permiso_con_goce', 'permiso_sin_goce', 'incapacidad')
        AND start_date <= '2026-11-16'
        AND end_date >= '2026-11-16'
    `;
    assert.equal(gen2.data.absences_today, Number(sqlAbs[0].cnt));

    const sqlOver20 = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT b.employee_id) AS cnt
      FROM balances b
      JOIN employees e ON e.id = b.employee_id
      WHERE e.status = 'activo' AND b.available_days > 20
    `;
    assert.equal(gen2.data.employees_over_20_vacation_days, Number(sqlOver20[0].cnt));

    // Confirmar que Home Office NO figura en absences_by_type ni en today_absent_records
    const types = (gen2.data.payload_json?.absences_by_type || []).map((x) => x.name.toLowerCase());
    assert.ok(!types.some((t) => t.includes('home')));
    const depts = gen2.data.payload_json?.departments_catalog || [];
    assert.ok(depts.length >= 5, 'Debe listar todos los departamentos activos');

    // 5. Verificar GET /api/dashboard/report devuelve la misma cifra
    const fetched = await apiJson(baseUrl, `/api/dashboard/report?report_date=${targetDate}`, {
      token: lauraToken,
    });
    assert.equal(fetched.status, 200);
    assert.equal(fetched.data.absences_today, gen2.data.absences_today);

    // 6. Scheduler cron se inicializa y detiene sin errores
    const tasks = startSchedulers(prisma);
    assert.equal(tasks.length, 2);
    stopSchedulers();
  } finally {
    await prisma.$disconnect();
    await new Promise((resolve) => server.close(resolve));
  }
});
