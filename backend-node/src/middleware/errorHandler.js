import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(statusCode, detail) {
    super(detail);
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ detail: err.detail });
  }

  if (err instanceof ZodError) {
    const first = err.errors[0];
    const field = first?.path?.join('.') || 'entrada';
    return res.status(400).json({
      detail: `Error de validación en ${field}: ${first?.message || 'valor inválido'}`,
      errors: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  // Errores conocidos de Prisma sin exponer detalles internos sensibles
  if (err?.code === 'P2002') {
    return res.status(409).json({ detail: 'Conflicto: ya existe un registro con ese identificador único.' });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ detail: 'Registro no encontrado.' });
  }
  if (err?.code === 'P2003') {
    return res.status(400).json({ detail: 'Referencia relacional inválida.' });
  }

  console.error('[Error interno]', err?.message || err);
  return res.status(500).json({ detail: 'Error interno del servidor.' });
}
