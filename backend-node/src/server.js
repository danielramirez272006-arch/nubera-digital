import { createApp } from './app.js';
import { config } from './config.js';
import { disconnectPrisma, prisma } from './db/prisma.js';
import { startSchedulers, stopSchedulers } from './services/scheduler.js';

const app = createApp();

async function start() {
  await prisma.$connect();
  if (process.env.NODE_ENV !== 'test') {
    startSchedulers(prisma);
  }
  const server = app.listen(config.APP_PORT, config.APP_HOST, () => {
    console.log(`Nubera RRHH backend-node escuchando en http://${config.APP_HOST}:${config.APP_PORT}`);
  });

  const shutdown = async (signal) => {
    console.log(`Recibida señal ${signal}, cerrando servidor y conexiones Prisma...`);
    stopSchedulers();
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch(async (err) => {
  console.error('Error al iniciar backend-node:', err);
  await disconnectPrisma();
  process.exit(1);
});
