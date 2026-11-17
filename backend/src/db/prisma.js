import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

/**
 * Instancia única compartida de PrismaClient por proceso.
 */
export const prisma =
  globalForPrisma.__nuberaPrisma ||
  new PrismaClient({
    log: process.env.APP_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.APP_ENV !== 'production') {
  globalForPrisma.__nuberaPrisma = prisma;
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
