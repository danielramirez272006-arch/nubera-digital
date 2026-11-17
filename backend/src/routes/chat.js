import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { checkRateLimit } from '../middleware/rateLimit.js';
import { processChatQuery } from '../agents/orchestrator.js';

export const chatRouter = Router();

const chatBodySchema = z.object({
  question: z.string().trim().min(2, 'Escribe una pregunta válida.').max(1500),
  session_id: z.string().max(64).optional().nullable(),
});

const historyQuerySchema = z.object({
  session_id: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

const feedbackBodySchema = z.object({
  helpful: z.boolean(),
});

function serializeChatLog(log, suggestedSummary = null) {
  return {
    id: log.id,
    trace_id: log.traceId,
    session_id: log.sessionId,
    question: log.question,
    answer: log.answer,
    intent: log.intent,
    agent_used: log.agentUsed,
    prompt_version: log.promptVersion,
    topic: log.topic,
    citations: Array.isArray(log.citationsJson) ? log.citationsJson : [],
    latency_ms: log.latencyMs,
    outcome: log.outcome,
    needs_hr_escalation: log.outcome === 'escalada_rrhh',
    suggested_ticket_summary: suggestedSummary,
    helpful: log.helpful,
    created_at: log.createdAt,
  };
}

chatRouter.get(
  '/conversations',
  requireAuth,
  asyncHandler(async (req, res) => {
    const convs = await prisma.chatConversation.findMany({
      where: { employeeId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, title: true, updatedAt: true },
    });

    res.json(
      convs.map((c) => ({
        id: c.id,
        title: c.title,
        updated_at: c.updatedAt,
      }))
    );
  })
);

chatRouter.post(
  '/',
  requireAuth,
  validateBody(chatBodySchema),
  asyncHandler(async (req, res) => {
    checkRateLimit(
      'chat',
      req.user.id,
      60,
      60_000,
      'Has alcanzado el límite temporal de consultas por minuto. Espera un momento.'
    );
    const { question, session_id } = req.validatedBody;
    const { log, suggestedSummary } = await processChatQuery(
      prisma,
      req.user,
      question,
      session_id || 'default'
    );
    res.setHeader('X-Trace-Id', log.traceId);
    res.json(serializeChatLog(log, suggestedSummary));
  })
);

chatRouter.get(
  '/history',
  requireAuth,
  validateQuery(historyQuerySchema),
  asyncHandler(async (req, res) => {
    const { session_id, limit } = req.validatedQuery;
    const where = { employeeId: req.user.id };
    if (session_id) {
      where.sessionId = session_id;
    }

    const logs = await prisma.chatLog.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    res.json(logs.map((l) => serializeChatLog(l)));
  })
);

chatRouter.post(
  '/:logId/feedback',
  requireAuth,
  validateBody(feedbackBodySchema),
  asyncHandler(async (req, res) => {
    const logId = Number(req.params.logId);
    if (!Number.isInteger(logId) || logId <= 0) {
      throw new AppError(400, 'Identificador de consulta inválido.');
    }

    const existing = await prisma.chatLog.findFirst({
      where: { id: logId, employeeId: req.user.id },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError(404, 'Consulta no encontrada.');
    }

    const updated = await prisma.chatLog.update({
      where: { id: logId },
      data: { helpful: req.validatedBody.helpful },
    });

    res.json({ status: 'ok', id: updated.id, helpful: updated.helpful });
  })
);
