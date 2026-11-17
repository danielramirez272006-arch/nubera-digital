import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Carga inicial reproducible e idempotente (no duplica registros existentes)
  const ana = await prisma.employee.upsert({
    where: { employeeCode: 'NUB-001' },
    update: {},
    create: {
      employeeCode: 'NUB-001',
      email: 'ana.garcia@nubera.mx',
      passwordHash: '$2b$12$placeholder_hash_seed',
      fullName: 'Ana Sofía García López',
      role: 'colaborador',
      department: 'Ingeniería',
      position: 'Desarrolladora Backend Sr.',
      hireDate: new Date('2024-05-11'),
      status: 'activo',
      salaryMxn: new Prisma.Decimal('58000.00'),
    },
  });

  await prisma.balance.upsert({
    where: { employeeId_year: { employeeId: ana.id, year: 2026 } },
    update: {},
    create: {
      employeeId: ana.id,
      year: 2026,
      entitledDays: new Prisma.Decimal('15.00'),
      usedDays: new Prisma.Decimal('2.00'),
      pendingDays: new Prisma.Decimal('4.00'),
      availableDays: new Prisma.Decimal('9.00'),
      expirationDate: new Date('2026-11-11'),
    },
  });

  const [empCount, docCount] = await Promise.all([
    prisma.employee.count(),
    prisma.driveDocument.count({ where: { status: 'activo' } }),
  ]);
  console.log(`Seed JS idempotente OK -> employees=${empCount}, active_drive_docs=${docCount}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
