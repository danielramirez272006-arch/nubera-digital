import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const collabHash = await bcrypt.hash('Colaborador123!', 10);
  const hrHash = await bcrypt.hash('Rrhh123!', 10);

  const seedUsers = [
    {
      employeeCode: 'NUB-001',
      email: 'ana.garcia@nubera.mx',
      passwordHash: collabHash,
      fullName: 'Ana Sofía García López',
      role: 'colaborador',
      department: 'Ingeniería',
      position: 'Desarrolladora Backend Sr.',
      hireDate: new Date('2024-05-11'),
      salaryMxn: new Prisma.Decimal('58000.00'),
      managerName: 'Diego Alejandro Santos Rivera',
      balance: { entitled: '15.00', used: '2.00', pending: '3.00', available: '10.00', exp: '2026-11-11' },
    },
    {
      employeeCode: 'NUB-002',
      email: 'laura.mendoza@nubera.mx',
      passwordHash: hrHash,
      fullName: 'Laura Patricia Mendoza Ortega',
      role: 'rrhh',
      department: 'Recursos Humanos',
      position: 'Gerente de Operaciones de RRHH',
      hireDate: new Date('2021-03-15'),
      salaryMxn: new Prisma.Decimal('68000.00'),
      managerName: 'Dirección General',
      balance: { entitled: '20.00', used: '4.00', pending: '0.00', available: '16.00', exp: '2026-09-15' },
    },
    {
      employeeCode: 'NUB-003',
      email: 'diego.santos@nubera.mx',
      passwordHash: hrHash,
      fullName: 'Diego Alejandro Santos Rivera',
      role: 'rrhh',
      department: 'Recursos Humanos',
      position: 'Especialista de Relaciones Laborales',
      hireDate: new Date('2022-07-01'),
      salaryMxn: new Prisma.Decimal('46000.00'),
      managerName: 'Laura Patricia Mendoza Ortega',
      balance: { entitled: '18.00', used: '3.00', pending: '0.00', available: '15.00', exp: '2027-01-01' },
    },
    {
      employeeCode: 'NUB-004',
      email: 'carlos.ruiz@nubera.mx',
      passwordHash: collabHash,
      fullName: 'Carlos Eduardo Ruiz Torres',
      role: 'colaborador',
      department: 'Datos & IA',
      position: 'Ingeniero de Datos',
      hireDate: new Date('2020-02-10'),
      salaryMxn: new Prisma.Decimal('62000.00'),
      managerName: 'Dirección de Datos & IA',
      balance: { entitled: '22.00', used: '0.00', pending: '0.00', available: '22.00', exp: '2026-08-10' },
    },
  ];

  for (const u of seedUsers) {
    const emp = await prisma.employee.upsert({
      where: { employeeCode: u.employeeCode },
      update: {},
      create: {
        employeeCode: u.employeeCode,
        email: u.email,
        passwordHash: u.passwordHash,
        fullName: u.fullName,
        role: u.role,
        department: u.department,
        position: u.position,
        hireDate: u.hireDate,
        status: 'activo',
        salaryMxn: u.salaryMxn,
        managerName: u.managerName,
      },
    });

    await prisma.balance.upsert({
      where: { employeeId_year: { employeeId: emp.id, year: 2026 } },
      update: {},
      create: {
        employeeId: emp.id,
        year: 2026,
        entitledDays: new Prisma.Decimal(u.balance.entitled),
        usedDays: new Prisma.Decimal(u.balance.used),
        pendingDays: new Prisma.Decimal(u.balance.pending),
        availableDays: new Prisma.Decimal(u.balance.available),
        expirationDate: new Date(u.balance.exp),
      },
    });
  }

  const ana = await prisma.employee.findUnique({ where: { email: 'ana.garcia@nubera.mx' } });
  if (ana) {
    const existingReq = await prisma.leaveRequest.count({ where: { employeeId: ana.id } });
    if (existingReq === 0) {
      await prisma.leaveRequest.create({
        data: {
          employeeId: ana.id,
          requestType: 'vacaciones',
          startDate: new Date('2026-12-02'),
          endDate: new Date('2026-12-05'),
          daysCount: new Prisma.Decimal('3.00'),
          status: 'pendiente',
          reason: 'Solicitud inicial de vacaciones (3 días hábiles, excluye sábado).',
        },
      });
    }
  }

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
