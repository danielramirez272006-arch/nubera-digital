import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { prisma } from './db/prisma.js';
import { asyncHandler, errorHandler } from './middleware/errorHandler.js';
import { openApiSpec } from './openapi.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { requestsRouter } from './routes/requests.js';
import { ticketsRouter } from './routes/tickets.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.corsOriginsList,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/openapi.json', (_req, res) => res.json(openApiSpec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', service: 'nubera-rrhh-backend-node', orm: 'prisma-mysql', version: '3.0.0' });
    })
  );

  app.get(
    '/api/system/status',
    asyncHandler(async (_req, res) => {
      const [activePolicies, activeChunks] = await Promise.all([
        prisma.driveDocument.count({ where: { status: 'activo' } }),
        prisma.documentChunk.count(),
      ]);
      res.json({
        environment: config.APP_ENV,
        database_mode: 'MySQL + Prisma ORM',
        drive_mode: config.GOOGLE_DRIVE_ENABLED ? 'Google Drive API' : 'Catálogo local (modo demostración)',
        llm_mode: config.LLM_PROVIDER !== 'none' ? config.LLM_PROVIDER : 'LangGraph.js + Embeddings locales',
        timezone: config.TIMEZONE,
        demo_mode: !config.GOOGLE_DRIVE_ENABLED,
        active_policies_count: activePolicies,
        active_chunks_count: activeChunks,
      });
    })
  );

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/tickets', ticketsRouter);

  app.use((_req, res) => {
    res.status(404).json({ detail: 'Ruta no encontrada.' });
  });

  app.use(errorHandler);
  return app;
}
