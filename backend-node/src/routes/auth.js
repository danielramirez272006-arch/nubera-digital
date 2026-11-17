import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { checkRateLimit } from '../middleware/rateLimit.js';
import { createAccessToken, requireAuth, revokeToken, verifyPassword } from '../middleware/auth.js';
import { toIsoDate } from '../services/vacationRules.js';
import { getNextPaymentInfo } from '../services/paymentSchedule.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email('Correo corporativo inválido.'),
  password: z.string().min(1, 'Contraseña obligatoria.'),
});

export function serializeUserSession(emp, overrideNextPay = null) {
  return {
    id: emp.id,
    employee_code: emp.employeeCode,
    email: emp.email,
    full_name: emp.fullName,
    role: emp.role,
    department: emp.department,
    position: emp.position,
    hire_date: toIsoDate(emp.hireDate),
    next_payment_date: overrideNextPay ? toIsoDate(overrideNextPay) : emp.nextPaymentDate ? toIsoDate(emp.nextPaymentDate) : null,
    next_review_date: emp.nextReviewDate ? toIsoDate(emp.nextReviewDate) : null,
  };
}

authRouter.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const emailNorm = req.validatedBody.email.trim().toLowerCase();
    const clientIp = req.ip || 'unknown';

    checkRateLimit(
      'login',
      `${clientIp}:${emailNorm}`,
      15,
      5 * 60 * 1000,
      'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.'
    );

    const employee = await prisma.employee.findFirst({
      where: { email: emailNorm, status: 'activo' },
    });

    const valid = employee ? await verifyPassword(req.validatedBody.password, employee.passwordHash) : false;
    if (!employee || !valid) {
      throw new AppError(401, 'Correo o contraseña incorrectos.');
    }

    const token = createAccessToken(employee);
    const payInfo = await getNextPaymentInfo(prisma);
    const redirectTo = employee.role === 'rrhh' ? '/dashboard' : '/consultas';

    res.json({
      access_token: token,
      token_type: 'bearer',
      redirect_to: redirectTo,
      user: serializeUserSession(employee, payInfo.projectedDate),
    });
  })
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    revokeToken(req.token);
    res.json({ status: 'ok', message: 'Sesión cerrada correctamente.' });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payInfo = await getNextPaymentInfo(prisma);
    res.json(serializeUserSession(req.user, payInfo.projectedDate));
  })
);
