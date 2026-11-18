import 'dotenv/config';
import { prisma } from '../src/db/prisma.js';
import { reconcileRequestBalances } from '../src/services/balanceReconciliation.js';

const apply = process.argv.includes('--apply');

try {
  const result = await reconcileRequestBalances(prisma, { apply });
  console.log(`Reconciliación (${result.mode}) -> revisadas: ${result.totalChecked}, cambios: ${result.changes.length}, ambiguas: ${result.ambiguousCases.length}, aplicadas: ${result.appliedCount}`);
  if (result.changes.length > 0) {
    console.table(result.changes);
  }
  if (result.ambiguousCases.length > 0) {
    console.log('Casos ambiguos conservados sin asignación arbitraria:');
    console.table(result.ambiguousCases);
  }
} finally {
  await prisma.$disconnect();
}
