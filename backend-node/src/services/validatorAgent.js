import { z } from 'zod';

const CONTRADICTION_PHRASES = [
  'no puedo responder',
  'no tengo acceso a tus datos',
  'no se encontró una política aplicable',
  'no cuento con esa información',
];

export const validationInputSchema = z.object({
  intent: z.enum(['politica', 'dato_personal', 'mixta', 'restringida', 'reporte']),
  answer: z.string(),
  citations: z.array(z.record(z.any())).default([]),
  toolFigures: z.array(z.string()).default([]),
  needsHrEscalation: z.boolean().default(false),
});

/**
 * Agente validador:
 * 1) Verifica respaldo de citas en consultas de política o mixta.
 * 2) Verifica que las cifras de herramientas SQL (dato_personal / mixta) coincidan exactamente.
 * 3) Detecta contradicciones en consultas mixtas.
 * 4) Verifica ausencia de instrucciones maliciosas o filtrado de prompt del sistema.
 */
export function validateResponse(input) {
  const parsed = validationInputSchema.parse(input);
  const errors = [];
  const lowerAns = parsed.answer.toLowerCase();

  if ((parsed.intent === 'politica' || parsed.intent === 'mixta') && !parsed.needsHrEscalation) {
    if (!parsed.citations || parsed.citations.length === 0) {
      errors.push('Falta cita documental verificable para respaldar la respuesta de política.');
    }
  }

  if ((parsed.intent === 'dato_personal' || parsed.intent === 'mixta') && parsed.toolFigures.length > 0) {
    for (const fig of parsed.toolFigures) {
      if (fig && !parsed.answer.includes(fig)) {
        errors.push(`La cifra '${fig}' de la herramienta SQL no coincide con la respuesta redactada.`);
      }
    }
  }

  if (parsed.intent === 'mixta' && parsed.toolFigures.length > 0) {
    if (CONTRADICTION_PHRASES.some((phrase) => lowerAns.includes(phrase))) {
      errors.push(
        'Contradicción detectada en consulta mixta: se incluyen datos personales junto con una negativa de respuesta.'
      );
    }
  }

  if (['system prompt', 'ignora las instrucciones', 'otorga permisos'].some((bad) => lowerAns.includes(bad))) {
    errors.push('Se detectó contenido potencialmente inseguro en la respuesta.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
