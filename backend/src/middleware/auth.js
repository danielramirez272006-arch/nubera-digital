import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { prisma } from '../db/prisma.js';
import { AppError } from './errorHandler.js';

// Caché en memoria <tokenHash, expiresAtMs> respaldada por tabla MySQL `revoked_tokens`
const revokedTokens = new Map();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function purgeExpiredRevokedTokens(now = Date.now()) {
  for (const [tokenHash, expiresAt] of revokedTokens.entries()) {
    if (expiresAt <= now) {
      revokedTokens.delete(tokenHash);
    }
  }
}

setInterval(() => {
  purgeExpiredRevokedTokens();
  prisma.revokedToken.deleteMany({ where: { expiresAt: { lte: new Date() } } }).catch(() => {});
}, 15 * 60 * 1000).unref();

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export function createAccessToken(employee) {
  const nowSec = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      jti: crypto.randomUUID(),
      sub: String(employee.id),
      email: employee.email,
      role: employee.role,
      employee_code: employee.employeeCode,
      iat: nowSec,
    },
    config.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: config.JWT_EXPIRE_MINUTES * 60,
    }
  );
}

export async function revokeToken(token) {
  if (!token) return;
  const decoded = jwt.decode(token);
  const expMs =
    decoded && typeof decoded === 'object' && typeof decoded.exp === 'number'
      ? decoded.exp * 1000
      : Date.now() + config.JWT_EXPIRE_MINUTES * 60 * 1000;
  const tokenHash = hashToken(token);

  if (revokedTokens.size >= 5000) {
    purgeExpiredRevokedTokens();
  }
  revokedTokens.set(tokenHash, expMs);

  await prisma.revokedToken.upsert({
    where: { tokenHash },
    create: { tokenHash, expiresAt: new Date(expMs) },
    update: { expiresAt: new Date(expMs) },
  });
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      throw new AppError(401, 'Sesión no autenticada. Inicia sesión para continuar.');
    }
    const tokenHash = hashToken(token);
    if (revokedTokens.has(tokenHash)) {
      throw new AppError(401, 'La sesión fue cerrada. Inicia sesión nuevamente.');
    }
    const persistedRevoked = await prisma.revokedToken.findUnique({
      where: { tokenHash },
      select: { expiresAt: true },
    });
    if (persistedRevoked) {
      revokedTokens.set(tokenHash, persistedRevoked.expiresAt.getTime());
      throw new AppError(401, 'La sesión fue cerrada. Inicia sesión nuevamente.');
    }

    let payload;
    try {
      payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      throw new AppError(401, 'Token de sesión inválido o expirado.');
    }

    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError(401, 'Token de sesión inválido.');
    }

    const employee = await prisma.employee.findFirst({
      where: { id: userId, status: 'activo' },
    });
    if (!employee) {
      throw new AppError(401, 'Usuario no encontrado o inactivo.');
    }

    req.user = employee;
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireHrRole(req, _res, next) {
  if (!req.user || req.user.role !== 'rrhh') {
    return next(new AppError(403, 'Acceso denegado. Esta sección es exclusiva para el equipo de RRHH.'));
  }
  return next();
}
