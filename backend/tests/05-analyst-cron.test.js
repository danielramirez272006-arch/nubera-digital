import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { createIsolatedTestEnv } from './helpers/isolatedDb.js';
import { startSchedulers, stopSchedulers, recoverMissedRuns } from '../src/services/scheduler.js';

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

test('Stage 6 (Isolated DB): Analyst report metrics vs SQL, home_office exclusion, idempotent upsert & cron scheduler', async () => {
  const env = await createIsolatedTestEnv({ tag: 'stage6' });
  const { prisma, baseUrl, users, balances } = env;

  try {
    // Sembrar ausencias (vacaciones aprobada + home_office aprobada + pendiente >3 días) y saldo >20 días
    await prisma.leaveRequest.createMany({
      data: [
        {
          employeeId: users.collab.id,
          balanceId: balances.balCollab2026.id,
          requestType: 'vacaciones',
          startDate: new Date('2026-11-15'),
          endDate: new Date('2026-11-17'),
          daysCount: new Prisma.Decimal('3.00'),
          status: 'aprobada',
          reason: 'Ausencia aprobada de prueba',
        },
        {
          employeeId: users.otherCollab.id,
          requestType: 'home_office',
          startDate: new Date('2026-11-16'),
          endDate: new Date('2026-11-16'),
          daysCount: new Prisma.Decimal('1.00'),
          status: 'aprobada',
          reason: 'Home office excluido de ausencias',
        },
        {
          employeeId: users.otherCollab.id,
          balanceId: balances.balOther2026.id,
          requestType: 'vacaciones',
          startDate: new Date('2026-12-01'),
          endDate: new Date('2026-12-02'),
          daysCount: new Prisma.Decimal('2.00'),
          status: 'pendiente',
          createdAt: new Date('2026-11-10T10:00:00.000Z'),
        },
      ],
    });

    await prisma.balance.update({
      where: { id: balances.balOther2026.id },
      data: { availableDays: new Prisma.Decimal('22.00'), entitledDays: new Prisma.Decimal('24.00') },
    });

    const collabLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: users.collab.email, password: 'TestCollab123!' },
    });
    const collabToken = collabLogin.data.access_token;

    const hrLogin = await apiJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: users.hrDirector.email, password: 'TestHr123!' },
    });
    const hrToken = hrLogin.data.access_token;

    // 1. RBAC dashboard
    assert.equal((await apiJson(baseUrl, '/api/dashboard/dates', { token: collabToken })).status, 403);
    assert.equal((await apiJson(baseUrl, '/api/dashboard/report', { token: collabToken })).status, 403);
    assert.equal(
      (await apiJson(baseUrl, '/api/dashboard/report/generate', { method: 'POST', token: collabToken })).status,
      403
    );

    // 2. Generar y recalcular reporte de forma idempotente para 2026-11-16
    const targetDate = '2026-11-16';
    const gen1 = await apiJson(baseUrl, `/api/dashboard/report/generate?report_date=${targetDate}`, {
      method: 'POST',
      token: hrToken,
    });
    assert.equal(gen1.status, 200);

    const gen2 = await apiJson(baseUrl, `/api/dashboard/report/generate?report_date=${targetDate}`, {
      method: 'POST',
      token: hrToken,
    });
    assert.equal(gen2.status, 200);
    assert.equal(gen2.data.absences_today, gen1.data.absences_today);
    assert.equal(gen2.data.pending_requests, gen1.data.pending_requests);
    assert.equal(gen2.data.pending_over_3_days, 1);

    const datesRes = await apiJson(baseUrl, '/api/dashboard/dates', { token: hrToken });
    assert.equal(datesRes.status, 200);
    assert.ok(Array.isArray(datesRes.data) && datesRes.data.includes(targetDate));

    // Verificar exactamente 1 fila por report_date en MySQL aislado
    const rowCount = await prisma.dailyReport.count({
      where: { reportDate: new Date(`${targetDate}T00:00:00.000Z`) },
    });
    assert.equal(rowCount, 1);

    // 3. Validar cifras contra SQL independiente
    const sqlAbs = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT employee_id) AS cnt
      FROM leave_requests
      WHERE status = 'aprobada'
        AND request_type IN ('vacaciones', 'permiso_con_goce', 'permiso_sin_goce', 'incapacidad')
        AND start_date <= '2026-11-16'
        AND end_date >= '2026-11-16'
    `;
    assert.equal(gen2.data.absences_today, Number(sqlAbs[0].cnt));
    assert.equal(gen2.data.absences_today, 1);

    const sqlOver20 = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT b.employee_id) AS cnt
      FROM balances b
      JOIN employees e ON e.id = b.employee_id
      WHERE e.status = 'activo' AND b.available_days > 20
    `;
    assert.equal(gen2.data.employees_over_20_vacation_days, Number(sqlOver20[0].cnt));
    assert.equal(gen2.data.employees_over_20_vacation_days, 1);

    // Confirmar que Home Office NO figura en absences_by_type
    const types = (gen2.data.payload_json?.absences_by_type || []).map((x) => x.name.toLowerCase());
    assert.ok(!types.some((t) => t.includes('home')));
    const depts = gen2.data.payload_json?.departments_catalog || [];
    assert.ok(depts.length >= 3, 'Debe listar los departamentos activos de la plantilla de prueba');

    // 4. Verificar GET /api/dashboard/report devuelve la misma cifra
    const fetched = await apiJson(baseUrl, `/api/dashboard/report?report_date=${targetDate}`, {
      token: hrToken,
    });
    assert.equal(fetched.status, 200);
    assert.equal(fetched.data.absences_today, gen2.data.absences_today);

    // 5. Scheduler cron se inicializa, recupera pendientes del día y detiene sin errores
    const rec = await recoverMissedRuns(prisma);
    assert.ok(rec.date);
    const tasks = startSchedulers(prisma, { runCatchUp: false });
    assert.equal(tasks.length, 2);
    stopSchedulers();
  } finally {
    await env.cleanup();
  }
});
