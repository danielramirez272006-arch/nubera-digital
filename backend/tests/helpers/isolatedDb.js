import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '../..');

export async function readBaseDatabaseUrl() {
  const envText = await fs.readFile(path.join(BACKEND_DIR, '.env'), 'utf8');
  const match = envText.match(/^DATABASE_URL\s*=\s*(.+)$/m);
  if (!match) throw new Error('No se encontró DATABASE_URL en backend/.env');
  return match[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * Crea una base temporal MySQL única e independiente antes de importar Prisma o iniciar Express.
 * Garantiza que su nombre sea distinto al de la base operativa del portal.
 */
export async function createIsolatedTestEnv({ tag = 'iso' } = {}) {
  const prodUrl = await readBaseDatabaseUrl();
  const parsed = new URL(prodUrl);
  const prodDb = parsed.pathname.replace(/^\//, '');

  const uniqueSuffix = `${process.pid}_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  const dbName = `nubera_test_${tag}_${uniqueSuffix}`;
  assert.notEqual(dbName, prodDb, 'La base de pruebas debe ser distinta de la base operativa.');

  parsed.pathname = `/${dbName}`;
  const isolatedUrl = parsed.toString();

  const adminPrisma = new PrismaClient({ datasources: { db: { url: prodUrl } } });
  await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await adminPrisma.$executeRawUnsafe(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  execSync('npx prisma migrate deploy', {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: isolatedUrl },
    stdio: 'pipe',
  });

  // Configurar entorno antes de importar el cliente Prisma y la app
  process.env.DATABASE_URL = isolatedUrl;
  process.env.GOOGLE_DRIVE_ENABLED = 'false';
  process.env.LLM_PROVIDER = 'none';

  const prisma = new PrismaClient({ datasources: { db: { url: isolatedUrl } } });
  const [{ createApp }] = await Promise.all([
    import(`../../src/app.js?isolated=${uniqueSuffix}`),
  ]);

  const collabHash = await bcrypt.hash('TestCollab123!', 8);
  const hrHash = await bcrypt.hash('TestHr123!', 8);

  const collab = await prisma.employee.create({
    data: {
      employeeCode: 'TST-001',
      email: 'test.collab@nubera.test',
      passwordHash: collabHash,
      fullName: 'Colaborador Prueba Aislada',
      role: 'colaborador',
      department: 'Ingeniería',
      position: 'Ingeniero de Pruebas',
      hireDate: new Date('2024-06-01'),
      status: 'activo',
      salaryMxn: new Prisma.Decimal('40000.00'),
    },
  });

  const otherCollab = await prisma.employee.create({
    data: {
      employeeCode: 'TST-002',
      email: 'test.other@nubera.test',
      passwordHash: collabHash,
      fullName: 'Otro Colaborador Prueba',
      role: 'colaborador',
      department: 'Producto',
      position: 'Analista',
      hireDate: new Date('2023-05-01'),
      status: 'activo',
      salaryMxn: new Prisma.Decimal('35000.00'),
    },
  });

  const hrDirector = await prisma.employee.create({
    data: {
      employeeCode: 'TST-003',
      email: 'laura.mendoza@nubera.test',
      passwordHash: hrHash,
      fullName: 'Laura Patricia Mendoza Ortega',
      role: 'rrhh',
      department: 'Recursos Humanos',
      position: 'Directora de Recursos Humanos',
      hireDate: new Date('2021-01-10'),
      status: 'activo',
      salaryMxn: new Prisma.Decimal('70000.00'),
    },
  });

  const hrSpecialist = await prisma.employee.create({
    data: {
      employeeCode: 'TST-004',
      email: 'diego.santos@nubera.test',
      passwordHash: hrHash,
      fullName: 'Diego Alejandro Santos Rivera',
      role: 'rrhh',
      department: 'Recursos Humanos',
      position: 'Especialista de Relaciones Laborales',
      hireDate: new Date('2022-03-15'),
      status: 'activo',
      salaryMxn: new Prisma.Decimal('45000.00'),
    },
  });

  const balCollab2026 = await prisma.balance.create({
    data: {
      employeeId: collab.id,
      year: 2026,
      entitledDays: new Prisma.Decimal('15.00'),
      usedDays: new Prisma.Decimal('0.00'),
      pendingDays: new Prisma.Decimal('0.00'),
      availableDays: new Prisma.Decimal('15.00'),
      expirationDate: new Date('2026-12-01'),
    },
  });

  const balOther2026 = await prisma.balance.create({
    data: {
      employeeId: otherCollab.id,
      year: 2026,
      entitledDays: new Prisma.Decimal('16.00'),
      usedDays: new Prisma.Decimal('0.00'),
      pendingDays: new Prisma.Decimal('0.00'),
      availableDays: new Prisma.Decimal('16.00'),
      expirationDate: new Date('2026-11-01'),
    },
  });

  const app = createApp();
  const server = http.createServer(app);
  const baseUrl = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });

  async function cleanup() {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
    await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await adminPrisma.$disconnect();
  }

  return {
    dbName,
    prodDb,
    prodUrl,
    isolatedUrl,
    prisma,
    app,
    server,
    baseUrl,
    users: { collab, otherCollab, hrDirector, hrSpecialist },
    balances: { balCollab2026, balOther2026 },
    cleanup,
  };
}
