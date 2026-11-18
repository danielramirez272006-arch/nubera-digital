import crypto from 'node:crypto';
import { config } from '../config.js';

const STOPWORDS_ES = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al',
  'a', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'y', 'o', 'u',
  'que', 'cual', 'cuales', 'como', 'cuando', 'donde', 'cuanto', 'cuanta',
  'cuantos', 'cuantas', 'me', 'mi', 'mis', 'te', 'tu', 'tus', 'su', 'sus',
  'se', 'nos', 'es', 'son', 'esta', 'estan', 'estar', 'ser', 'tengo',
  'tiene', 'tienen', 'puedo', 'puede', 'pueden', 'hay', 'si', 'no', 'lo',
  'le', 'les', 'mas', 'muy', 'ya', 'empresa', 'nubera', 'digital',
]);

const SYNONYM_GROUPS = {
  vacaciones: ['vacacion', 'vacaciones', 'descanso', 'feriado', 'aniversario', 'disfrute', 'caducan', 'vencen', 'proximo ano'],
  anticipacion: ['anticipacion', 'anticipo', 'antes', 'tiempo', 'pedir', 'solicitar', 'avisar', 'habiles'],
  permiso: ['permiso', 'permisos', 'licencia', 'licencias', 'ausencia', 'goce', 'paternidad', 'matrimonio', 'duelo', 'fallecimiento'],
  incapacidad: ['incapacidad', 'incapacidades', 'imss', 'enfermedad', 'medico', 'medica', 'maternidad', 'certificado', 'salud', 'riesgo'],
  pago: ['pago', 'pagos', 'nomina', 'quincena', 'sueldo', 'salario', 'aguinaldo', 'vales', 'fondo', 'ahorro', 'prestacion', 'prestaciones', 'prima', 'sgmm'],
  remoto: ['remoto', 'home office', 'hibrido', 'horario', 'entrada', 'salida', 'oficina', 'presencial', 'jornada'],
  evaluacion: ['evaluacion', 'desempeno', 'okr', 'merito', 'promocion', 'semestral'],
  capacitacion: ['capacitacion', 'certificacion', 'certificaciones', 'curso', 'presupuesto', 'aprendizaje'],
  etica: ['etica', 'acoso', 'nom 035', 'hostigamiento', 'discriminacion', 'denuncia', 'denuncias', 'confidencial', 'conducta', 'falta', 'reporta', 'reportar', 'canal'],
  feriados: ['feriado', 'feriados', 'festivo', 'festivos', 'asueto', 'calendario', 'inhabil', 'oficial'],
  viaticos: ['viaticos', 'viaje', 'hospedaje', 'alimentos', 'cfdi', 'reembolso'],
  seguridad: ['seguridad', 'computo', 'equipo', 'mfa', 'cifrado', 'laptop'],
  separacion: ['prueba', 'incorporacion', 'separacion', 'renuncia', 'preaviso', 'despido', 'indemnizacion', 'liquidacion'],
  beneficios: ['beneficio', 'beneficios', 'seguro', 'poliza', 'cobertura', 'capacitacion', 'curso'],
};

export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text) {
  const norm = normalizeText(text);
  const tokens = norm
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS_ES.has(t));

  const expanded = [...tokens];
  for (const token of tokens) {
    for (const [groupKey, terms] of Object.entries(SYNONYM_GROUPS)) {
      const matched =
        terms.includes(token) ||
        terms.some((t) => t.length >= 5 && token.startsWith(t.slice(0, 5)));
      if (matched) {
        expanded.push(`topic_${groupKey}`);
      }
    }
  }
  return expanded;
}

function hashToken(token, dim) {
  const digest = crypto.createHash('blake2b512').update(token, 'utf8').digest();
  const val = digest.readBigUInt64BE(0);
  const idx = Number(val % BigInt(dim));
  const sign = ((val >> 8n) & 1n) === 0n ? 1.0 : -1.0;
  return { idx, sign };
}

/**
 * Genera un vector L2-normalizado de dimensión EMBEDDING_DIM (384).
 * Combina tokens normalizados, expansión de sinónimos en español, bigramas y 4-gramas.
 */
export function embedText(text) {
  const dim = config.EMBEDDING_DIM || 384;
  const vec = new Float32Array(dim);
  const tokens = tokenize(text);

  for (const tok of tokens) {
    const weight = tok.startsWith('topic_') ? 2.0 : 1.5;
    const { idx, sign } = hashToken(tok, dim);
    vec[idx] += sign * weight;
  }

  for (let i = 0; i < tokens.length - 1; i += 1) {
    const bigram = `${tokens[i]}_${tokens[i + 1]}`;
    const { idx, sign } = hashToken(bigram, dim);
    vec[idx] += sign * 1.2;
  }

  const normStr = normalizeText(text);
  for (let i = 0; i < Math.max(0, normStr.length - 3); i += 1) {
    const quad = normStr.slice(i, i + 4);
    if (!quad.includes(' ')) {
      const { idx, sign } = hashToken(`c_${quad}`, dim);
      vec[idx] += sign * 0.25;
    }
  }

  let sqSum = 0;
  for (let i = 0; i < dim; i += 1) {
    sqSum += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sqSum);
  if (norm > 0) {
    for (let i = 0; i < dim; i += 1) {
      vec[i] = vec[i] / norm;
    }
  }

  return Array.from(vec);
}

export function cosineSimilarity(vecA, vecB) {
  const isArrA = Array.isArray(vecA) || ArrayBuffer.isView(vecA);
  const isArrB = Array.isArray(vecB) || ArrayBuffer.isView(vecB);
  if (!isArrA || !isArrB || vecA.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    const a = Number(vecA[i]) || 0;
    const b = Number(vecB[i]) || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}
