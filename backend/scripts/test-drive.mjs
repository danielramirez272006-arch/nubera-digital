import 'dotenv/config';
import { prisma } from '../src/db/prisma.js';
import { fetchRealDriveDocuments } from '../src/agents/ingestionAgent.js';

try {
  const docs = await fetchRealDriveDocuments();
  console.log(`Google Drive OK -> ${docs.length} archivo(s) leídos desde la carpeta configurada.`);
  for (const d of docs) {
    console.log(`- [${d.policy_code || 'SIN-ID'}] ${d.title} (${d.sections.length} secciones)`);
  }
} finally {
  await prisma.$disconnect();
}
