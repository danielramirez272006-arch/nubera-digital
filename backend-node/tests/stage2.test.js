import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/db/prisma.js';

function startTestServer() {
  const app = createApp();
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

test('Etapa 2: Express, /api/health, /api/system/status, /openapi.json y relaciones Prisma en MySQL', async () => {
  const { server, url } = await startTestServer();
  try {
    const health = await fetch(`${url}/api/health`);
    assert.equal(health.status, 200);
    const hJson = await health.json();
    assert.equal(hJson.status, 'ok');
    assert.equal(hJson.orm, 'prisma-mysql');

    const sys = await fetch(`${url}/api/system/status`);
    assert.equal(sys.status, 200);
    const sJson = await sys.json();
    assert.equal(sJson.database_mode, 'MySQL + Prisma ORM');
    assert.ok(sJson.active_policies_count >= 10);

    const oapi = await fetch(`${url}/openapi.json`);
    assert.equal(oapi.status, 200);
    const oJson = await oapi.json();
    assert.equal(oJson.openapi, '3.0.3');

    const docsRes = await fetch(`${url}/docs/`);
    assert.equal(docsRes.status, 200);

    const ana = await prisma.employee.findUnique({
      where: { email: 'ana.garcia@nubera.mx' },
      include: { balances: true, leaveRequests: true },
    });
    assert.ok(ana);
    assert.ok(ana.balances.length >= 1);
  } finally {
    await new Promise((res) => server.close(res));
    await disconnectPrisma();
  }
});
