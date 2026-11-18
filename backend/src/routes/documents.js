import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import { prisma as defaultPrisma } from '../db/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { createRequireAuth, requireHrRole } from '../middleware/auth.js';
import { syncDrivePolicies } from '../agents/ingestionAgent.js';

async function resolveOAuthClientCredentials() {
  let clientId = config.GOOGLE_OAUTH_CLIENT_ID;
  let clientSecret = config.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    try {
      const raw = JSON.parse(await fs.readFile(path.resolve(config.GOOGLE_OAUTH_CLIENT_FILE), 'utf8'));
      const cfg = raw.web || raw.installed || {};
      clientId = clientId || cfg.client_id || '';
      clientSecret = clientSecret || cfg.client_secret || '';
    } catch {
      // ignore missing file
    }
  }
  return { clientId, clientSecret };
}

export function createDocumentsRouters(prisma = defaultPrisma) {
  const documentsRouter = Router();
  const ingestionRouter = Router();
  const requireAuth = createRequireAuth(prisma);

  documentsRouter.get(
  '/',
  requireAuth,
  requireHrRole,
  asyncHandler(async (_req, res) => {
    const [docs, alerts, totalChunks] = await Promise.all([
      prisma.driveDocument.findMany({
        orderBy: { policyCode: 'asc' },
        include: {
          _count: { select: { chunks: true } },
        },
      }),
      prisma.documentAuditAlert.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.documentChunk.count(),
    ]);

    let lastSyncedAt = null;
    for (const d of docs) {
      if (d.lastSyncedAt && (!lastSyncedAt || d.lastSyncedAt > lastSyncedAt)) {
        lastSyncedAt = d.lastSyncedAt;
      }
    }

    res.json({
      last_synced_at: lastSyncedAt,
      total_active_documents: docs.filter((d) => d.status === 'activo').length,
      total_chunks: totalChunks,
      documents: docs.map((d) => ({
        id: d.id,
        drive_file_id: d.driveFileId,
        policy_code: d.policyCode,
        title: d.title,
        mime_type: d.mimeType,
        version: d.version,
        effective_date: d.effectiveDate,
        owner: d.owner,
        drive_url: d.driveUrl,
        status: d.status,
        chunks_count: d._count?.chunks || 0,
        last_synced_at: d.lastSyncedAt,
      })),
      alerts: alerts.map((a) => ({
        id: a.id,
        drive_file_id: a.driveFileId,
        title: a.title,
        alert_type: a.alertType,
        severity: a.severity,
        detail: a.detail,
        status: a.status || (a.resolved ? 'revisada' : 'activa'),
        occurrence_count: a.occurrenceCount || 1,
        resolved: a.resolved,
        last_seen_at: a.lastSeenAt || a.createdAt,
        resolved_at: a.resolvedAt,
        created_at: a.createdAt,
      })),
    });
  })
);

documentsRouter.get(
  '/:driveFileId/content',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { driveFileId } = req.params;
    const doc = await prisma.driveDocument.findUnique({
      where: { driveFileId },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
          select: { section: true, content: true },
        },
      },
    });
    if (!doc) {
      throw new AppError(404, 'Documento no encontrado.');
    }

    res.json({
      drive_file_id: doc.driveFileId,
      policy_code: doc.policyCode,
      title: doc.title,
      mime_type: doc.mimeType,
      version: doc.version,
      effective_date: doc.effectiveDate,
      owner: doc.owner,
      drive_url: doc.driveUrl,
      status: doc.status,
      last_synced_at: doc.lastSyncedAt,
      sections: doc.chunks,
    });
  })
);

documentsRouter.post(
  '/alerts/:alertId/resolve',
  requireAuth,
  requireHrRole,
  asyncHandler(async (req, res) => {
    const alertId = Number(req.params.alertId);
    if (!Number.isInteger(alertId) || alertId <= 0) {
      throw new AppError(400, 'Identificador de alerta inválido.');
    }

    const existing = await prisma.documentAuditAlert.findUnique({ where: { id: alertId } });
    if (!existing) {
      throw new AppError(404, 'Alerta no encontrada.');
    }

    const updated = await prisma.documentAuditAlert.update({
      where: { id: alertId },
      data: {
        status: 'revisada',
        resolved: true,
        resolvedAt: new Date(),
      },
    });

    res.json({
      status: 'ok',
      id: updated.id,
      alert_status: updated.status,
    });
  })
);

ingestionRouter.get(
  '/oauth/url',
  requireAuth,
  requireHrRole,
  asyncHandler(async (_req, res) => {
    const { clientId } = await resolveOAuthClientCredentials();
    if (!clientId) {
      throw new AppError(400, 'Configura GOOGLE_OAUTH_CLIENT_ID o client_secret.json en backend/.env');
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: config.GOOGLE_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      access_type: 'offline',
      prompt: 'consent',
    });
    res.json({ auth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  })
);

ingestionRouter.post(
  '/sync',
  requireAuth,
  requireHrRole,
  asyncHandler(async (_req, res) => {
    const stats = await syncDrivePolicies(prisma);
    res.json({ status: 'ok', sync_stats: stats });
  })
  );

  return { documentsRouter, ingestionRouter };
}

export const { documentsRouter, ingestionRouter } = createDocumentsRouters(defaultPrisma);

export const googleOAuthCallbackHandler = asyncHandler(async (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!code) {
    throw new AppError(400, 'Falta parámetro code de autorización OAuth.');
  }
  const { clientId, clientSecret } = await resolveOAuthClientCredentials();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: config.GOOGLE_OAUTH_REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new AppError(400, `Error al intercambiar código OAuth: ${txt}`);
  }
  const tokenData = await resp.json();
  tokenData.client_id = clientId;
  tokenData.client_secret = clientSecret;
  tokenData.token_uri = 'https://oauth2.googleapis.com/token';

  await fs.writeFile(path.resolve(config.GOOGLE_OAUTH_TOKEN_FILE), JSON.stringify(tokenData, null, 2), 'utf8');
  res.json({
    status: 'ok',
    message: 'Google Drive autorizado correctamente. Ya puedes sincronizar documentos.',
  });
});
