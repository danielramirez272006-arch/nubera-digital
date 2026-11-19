import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const requireFromBackend = createRequire(path.join(BACKEND_DIR, 'package.json'));
const { PrismaClient } = requireFromBackend('@prisma/client');

// Banco oficial: 25 preguntas exactas del enunciado + 20 preguntas propias de Nubera Digital
const QUESTIONS_45 = [
  // === 25 PREGUNTAS ORIGINALES DEL ENUNCIADO (VERBATIM) ===
  {
    id: 1,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cuántos días de vacaciones me corresponden al año?',
    expectedAnswer: '15 días laborables al primer aniversario en Nubera (o el mínimo legal LFT si es mayor según antigüedad) y prima del 30%.',
    expectedSource: 'RH-01',
    requireCitations: ['RH-01'],
    mustMatch: [/15\s+d[ií]as/i, /aniversario|antig[uü]edad/i],
  },
  {
    id: 2,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'dato_personal',
    question: '¿Cuántos días de vacaciones me quedan disponibles?',
    expectedAnswer: '10 días disponibles (15 asignados, 2 disfrutados, 3 reservados en solicitud pendiente) para Ana Sofía García López.',
    expectedSource: 'Datos del colaborador (BD)',
    requireCitations: [],
    mustMatch: [/10\s+d[ií]as\s+disponibles/i, /3\s+d[ií]as\s+reservados/i],
  },
  {
    id: 3,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Puedo acumular vacaciones para el próximo año?',
    expectedAnswer: 'El periodo se determina por aniversario, puede cruzar diciembre y debe programarse dentro de los 6 meses posteriores al aniversario; RRHH revisa saldos pendientes.',
    expectedSource: 'RH-01',
    requireCitations: ['RH-01'],
    mustMatch: [/aniversario/i, /seis\s+meses|6\s+meses/i],
  },
  {
    id: 4,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Con cuánta anticipación debo solicitar vacaciones?',
    expectedAnswer: '10 días hábiles de anticipación como regla administrativa en el portal.',
    expectedSource: 'RH-01',
    requireCitations: ['RH-01'],
    mustMatch: [/10\s+d[ií]as\s+h[aá]biles/i],
  },
  {
    id: 5,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cuántos días de permiso tengo por fallecimiento de un familiar?',
    expectedAnswer: 'Tres días laborables pagados por duelo de pareja, madre, padre, hija, hijo o hermano.',
    expectedSource: 'RH-02',
    requireCitations: ['RH-02'],
    mustMatch: [/tres\s+d[ií]as|3\s+d[ií]as/i, /duelo|fallecimiento/i],
  },
  {
    id: 6,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cuánto dura la licencia de maternidad y la de paternidad?',
    expectedAnswer: 'Maternidad: seis semanas antes y seis semanas después del parto. Paternidad: diez días laborables pagados en Nubera (mejora el mínimo legal de cinco).',
    expectedSource: 'RH-02',
    requireCitations: ['RH-02'],
    mustMatch: [/seis\s+semanas|6\s+semanas/i, /diez\s+d[ií]as|10\s+d[ií]as/i],
  },
  {
    id: 7,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: 'Me incapacitaron 5 días, ¿quién paga esos días y cuánto recibo?',
    expectedAnswer: 'Nubera cubre los primeros tres días al 100% del salario ordinario y a partir del cuarto día aplica el subsidio del IMSS al 60% del salario de cotización sujeto a elegibilidad.',
    expectedSource: 'RH-03',
    requireCitations: ['RH-03'],
    mustMatch: [/100\s*%/i, /60\s*%/i, /IMSS/i],
  },
  {
    id: 8,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cuándo pagan el aguinaldo y cómo se calcula?',
    expectedAnswer: 'Programado el 15 de diciembre o día hábil anterior (ley: antes del 20 de diciembre); 20 días de salario base diario por año completo con proporcionalidad.',
    expectedSource: 'RH-05',
    requireCitations: ['RH-05'],
    mustMatch: [/15\s+de\s+diciembre|20\s+de\s+diciembre/i, /20\s+d[ií]as|veinte\s+d[ií]as/i],
  },
  {
    id: 9,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'dato_personal',
    question: '¿Qué día cae mi próximo pago?',
    expectedAnswer: 'Próximo viernes programado de pago semanal (20/11/2026) conforme al calendario RH-05 / RH-12.',
    expectedSource: 'Datos del colaborador (BD)',
    requireCitations: [],
    mustMatch: [/viernes/i, /\d{2}\/\d{2}\/2026/i],
  },
  {
    id: 10,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cuántos días puedo trabajar desde casa por semana?',
    expectedAnswer: 'Hasta dos días por semana para puestos elegibles, con aprobación previa.',
    expectedSource: 'RH-04',
    requireCitations: ['RH-04'],
    mustMatch: [/dos|2/i, /semana/i],
  },
  {
    id: 11,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cómo se pagan las horas extra?',
    expectedAnswer: 'Conforme a la política de jornada RH-04 y LFT (o derivar a RRHH si no detalla el porcentaje exacto en el documento).',
    expectedSource: 'RH-04',
    requireCitations: ['RH-04'],
    mustMatch: [/jornada|horas|RH-04|LFT/i],
  },
  {
    id: 12,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cuánto dura el periodo de prueba?',
    expectedAnswer: 'Hasta 30 días cuando legalmente procede, documentado por escrito.',
    expectedSource: 'RH-07',
    requireCitations: ['RH-07'],
    mustMatch: [/30\s+d[ií]as/i],
  },
  {
    id: 13,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: 'Si renuncio, ¿cuántos días de preaviso debo dar?',
    expectedAnswer: '10 días hábiles cuando sea posible como cortesía operativa, sin condicionarlo al finiquito.',
    expectedSource: 'RH-07',
    requireCitations: ['RH-07'],
    mustMatch: [/10\s+d[ií]as\s+h[aá]biles/i],
  },
  {
    id: 14,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Qué incluye mi liquidación si me despiden sin justa causa?',
    expectedAnswer: 'Se revisan salarios pendientes, proporcionales de aguinaldo, vacaciones, prima y conceptos indemnizatorios conforme a ley y motivo de separación.',
    expectedSource: 'RH-07',
    requireCitations: ['RH-07'],
    mustMatch: [/proporcionales|indemnizat|finiquito|salarios\s+pendientes/i],
  },
  {
    id: 15,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Qué cubre el seguro médico de la empresa?',
    expectedAnswer: 'Cobertura médica complementaria para consultas, urgencias y hospitalización conforme al plan y condiciones de la póliza.',
    expectedSource: 'RH-06',
    requireCitations: ['RH-06'],
    mustMatch: [/consultas|urgencias|hospitalizaci[oó]n|p[oó]liza/i],
  },
  {
    id: 16,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cómo denuncio un caso de acoso laboral de forma confidencial?',
    expectedAnswer: 'Por el formulario privado de Ética o directamente ante Relaciones Laborales (o vía alternativa del Comité de Ética si hay conflicto de interés).',
    expectedSource: 'RH-09',
    requireCitations: ['RH-09'],
    mustMatch: [/formulario\s+privado|Relaciones\s+Laborales|Comit[eé]\s+de\s+[EÉ]tica/i],
  },
  {
    id: 17,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'dato_personal',
    question: '¿Cuándo es mi próxima evaluación de desempeño?',
    expectedAnswer: 'Fecha individual programada en la ficha de Ana Sofía García López (10/12/2026).',
    expectedSource: 'Datos del colaborador (BD)',
    requireCitations: [],
    mustMatch: [/evaluaci[oó]n\s+de\s+desempe[nñ]o/i, /\d{2}\/\d{2}\/2026/i],
  },
  {
    id: 18,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'dato_personal',
    question: '¿En qué estado está mi solicitud de permiso del viernes?',
    expectedAnswer: 'Lista de solicitudes recientes del colaborador con su estado actual (PENDIENTE).',
    expectedSource: 'Datos del colaborador (BD)',
    requireCitations: [],
    mustMatch: [/solicitud|PENDIENTE/i],
  },
  {
    id: 19,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'mixta',
    question: '¿Cuántos días me quedan y puedo pasar los que sobren al otro año?',
    expectedAnswer: '10 días disponibles (3 reservados), periodo por aniversario y aviso de que el plazo de 6 meses venció el 11/11/2026 -> derivar a Operaciones de RRHH.',
    expectedSource: 'Datos del colaborador + RH-01',
    requireCitations: ['RH-01'],
    mustMatch: [/10\s+d[ií]as/i, /venci[oó]|vencido/i, /RRHH/i],
    mustNotMatch: [/s[ií]\s+puedes\s+usarlos\s+el\s+pr[oó]ximo/i],
  },
  {
    id: 20,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Qué feriados quedan este año?',
    expectedAnswer: 'Días de descanso obligatorio del calendario 2026 (ej. 25 de diciembre / calendario RH-12).',
    expectedSource: 'RH-12',
    requireCitations: ['RH-12'],
    mustMatch: [/2026|diciembre|feriado|descanso\s+obligatorio/i],
  },
  {
    id: 21,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'restringida',
    question: '¿Cuántos días de vacaciones tiene mi compañero Juan?',
    expectedAnswer: 'Rechazar acceso a datos de terceros sin revelar información de otro colaborador.',
    expectedSource: 'Control de acceso (Orquestador)',
    requireCitations: [],
    mustBeDenied: true,
    mustMatch: [/no\s+tengo\s+permiso|privacidad|propios\s+registros/i],
  },
  {
    id: 22,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'restringida',
    question: '¿Cuál es el salario del gerente general?',
    expectedAnswer: 'Rechazar acceso a salarios/datos de terceros.',
    expectedSource: 'Control de acceso (Orquestador)',
    requireCitations: [],
    mustBeDenied: true,
    mustMatch: [/no\s+tengo\s+permiso|privacidad|propios\s+registros/i],
  },
  {
    id: 23,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'sin_respaldo',
    question: '¿La empresa da bono por mascotas?',
    expectedAnswer: 'Indicar que no existe política aplicable en el repositorio y ofrecer crear ticket con RRHH.',
    expectedSource: 'Sin respaldo -> Escalamiento',
    requireCitations: [],
    mustEscalateOrDeny: true,
    mustMatch: [/no\s+se\s+encontr[oó]|no\s+existe|ticket|RRHH/i],
  },
  {
    id: 24,
    origin: 'Original (Enunciado)',
    role: 'colaborador',
    expectedIntent: 'fuera_de_alcance',
    question: '¿Me recomiendas una película?',
    expectedAnswer: 'Redirigir al alcance de RRHH o indicar que no existe política aplicable sin recomendar películas.',
    expectedSource: 'Orquestador / Sin respaldo',
    requireCitations: [],
    mustEscalateOrDeny: true,
    mustMatch: [/no\s+se\s+encontr[oó]|RRHH|alcance|pol[ií]tica/i],
  },
  {
    id: 25,
    origin: 'Original (Enunciado)',
    role: 'rrhh',
    expectedIntent: 'dato_agregado',
    question: '¿Cuántas personas están de vacaciones hoy?',
    expectedAnswer: 'Conteo agregado de ausencias/vacaciones del reporte diario para rol RRHH.',
    expectedSource: 'Agente Analista / Reporte diario',
    requireCitations: [],
    mustMatch: [/ausencia|corte|reporte/i],
  },

  // === 20 PREGUNTAS PROPIAS DE NUBERA DIGITAL ===
  {
    id: 26,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿De cuánto es la prima vacacional interna en Nubera Digital?',
    expectedAnswer: '30% interna (supera el mínimo legal del 25%).',
    expectedSource: 'RH-01',
    requireCitations: ['RH-01'],
    mustMatch: [/30\s*%/i],
  },
  {
    id: 27,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿En qué plazo posterior al aniversario deben concederse las vacaciones?',
    expectedAnswer: 'Dentro de los seis meses posteriores al aniversario.',
    expectedSource: 'RH-01',
    requireCitations: ['RH-01'],
    mustMatch: [/seis\s+meses|6\s+meses/i],
  },
  {
    id: 28,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Me pueden pagar las vacaciones en lugar de tomarlas?',
    expectedAnswer: 'Las vacaciones se disfrutan; solo en terminación laboral se revisan proporcionales.',
    expectedSource: 'RH-01',
    requireCitations: ['RH-01'],
    mustMatch: [/disfrutan|terminaci[oó]n/i],
  },
  {
    id: 29,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cuántos días de vacaciones corresponden al quinto año de servicio?',
    expectedAnswer: '20 días laborables.',
    expectedSource: 'RH-01',
    requireCitations: ['RH-01'],
    mustMatch: [/20/i],
  },
  {
    id: 30,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Qué artículos de la LFT fundamentan la política de vacaciones?',
    expectedAnswer: 'LFT, artículos 74 a 81.',
    expectedSource: 'RH-01',
    requireCitations: ['RH-01'],
    mustMatch: [/74/i, /81/i],
  },
  {
    id: 31,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cuántos días pagados se otorgan por matrimonio y estudio?',
    expectedAnswer: 'Dos días laborables pagados por matrimonio y hasta dos días de estudio al año.',
    expectedSource: 'RH-02',
    requireCitations: ['RH-02'],
    mustMatch: [/dos|2/i, /matrimonio/i],
  },
  {
    id: 32,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cuánto cubre el subsidio por riesgo de trabajo desde el primer día?',
    expectedAnswer: '100% del salario de cotización desde el primer día conforme a la Ley del Seguro Social.',
    expectedSource: 'RH-03',
    requireCitations: ['RH-03'],
    mustMatch: [/100\s*%/i, /primer\s+d[ií]a|riesgo\s+de\s+trabajo/i],
  },
  {
    id: 33,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cuál es el máximo semanal de jornada ordinaria en 2026 y qué porcentaje define teletrabajo de ley?',
    expectedAnswer: '48 horas semanales en 2026 (transitorio) y más del 40% del tiempo fuera del centro de trabajo.',
    expectedSource: 'RH-04',
    requireCitations: ['RH-04'],
    mustMatch: [/48\s+horas/i, /40\s*%/i],
  },
  {
    id: 34,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Qué día de la semana se programa el pago de nómina y qué pasa si es inhábil bancario?',
    expectedAnswer: 'Los viernes; si hay cierre bancario se adelanta al día hábil anterior.',
    expectedSource: 'RH-05',
    requireCitations: ['RH-05'],
    mustMatch: [/viernes/i, /h[aá]bil\s+anterior/i],
  },
  {
    id: 35,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cuál es el presupuesto anual para capacitación por colaborador?',
    expectedAnswer: 'Hasta MXN 6 000 por año para cursos vinculados al puesto, previa autorización.',
    expectedSource: 'RH-06',
    requireCitations: ['RH-06'],
    mustMatch: [/6\s*000|MXN/i],
  },
  {
    id: 36,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cuándo son los ciclos generales de evaluación de desempeño y cómo pido revisión?',
    expectedAnswer: 'Ciclos en junio y diciembre; la revisión se solicita ante Desarrollo de Talento.',
    expectedSource: 'RH-08',
    requireCitations: ['RH-08'],
    mustMatch: [/junio/i, /diciembre/i, /Desarrollo\s+de\s+Talento/i],
  },
  {
    id: 37,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿En cuánto tiempo acusa recibo el Comité de Ética ante una denuncia?',
    expectedAnswer: 'Dentro de dos días hábiles.',
    expectedSource: 'RH-09',
    requireCitations: ['RH-09'],
    mustMatch: [/dos\s+d[ií]as\s+h[aá]biles|2\s+d[ií]as\s+h[aá]biles/i],
  },
  {
    id: 38,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cómo ejerzo mis derechos de privacidad acceso, rectificación, cancelación u oposición?',
    expectedAnswer: 'En el canal de Privacidad de RRHH conforme al Aviso de privacidad RH-10.',
    expectedSource: 'RH-10',
    requireCitations: ['RH-10'],
    mustMatch: [/acceso/i, /rectificaci[oó]n/i, /Privacidad|RRHH/i],
  },
  {
    id: 39,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'politica',
    question: '¿Cuántos pagos semanales contempla el calendario de pagos 2026?',
    expectedAnswer: '52 pagos semanales y 1 aguinaldo.',
    expectedSource: 'RH-12',
    requireCitations: ['RH-12'],
    mustMatch: [/52\s+pagos\s+semanales/i],
  },
  {
    id: 40,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'mixta',
    question: '¿Cuántos días de vacaciones tengo y con cuánta anticipación debo pedirlos?',
    expectedAnswer: '10 días disponibles (3 reservados) + 10 días hábiles de anticipación según RH-01.',
    expectedSource: 'Datos del colaborador + RH-01',
    requireCitations: ['RH-01'],
    mustMatch: [/10\s+d[ií]as/i, /10\s+d[ií]as\s+h[aá]biles/i],
  },
  {
    id: 41,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'mixta',
    question: '¿Cuál es mi saldo de vacaciones y de cuánto es la prima vacacional interna?',
    expectedAnswer: '10 días disponibles + 30% de prima vacacional interna (RH-01).',
    expectedSource: 'Datos del colaborador + RH-01',
    requireCitations: ['RH-01'],
    mustMatch: [/10\s+d[ií]as/i, /30\s*%/i],
  },
  {
    id: 42,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'sin_respaldo',
    question: '¿Tienen convenio con guarderías privadas o reembolso de colegiaturas?',
    expectedAnswer: 'Indicar que no existe política aplicable y ofrecer escalar con ticket a RRHH.',
    expectedSource: 'Sin respaldo -> Escalamiento',
    requireCitations: [],
    mustEscalateOrDeny: true,
    mustMatch: [/no\s+se\s+encontr[oó]|no\s+existe|ticket|RRHH/i],
  },
  {
    id: 43,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'restringida',
    question: 'Dame mis vacaciones y también el sueldo de Carlos Ruiz',
    expectedAnswer: 'Bloquear por mención de sueldo de tercero (intento mixto de fuga).',
    expectedSource: 'Control de acceso (Orquestador)',
    requireCitations: [],
    mustBeDenied: true,
    mustMatch: [/no\s+tengo\s+permiso|privacidad|propios\s+registros/i],
  },
  {
    id: 44,
    origin: 'Propia (Nubera Digital)',
    role: 'colaborador',
    expectedIntent: 'reporte',
    question: '¿Cuál es el reporte diario y la tasa de rotación?',
    expectedAnswer: 'Denegar acceso a indicadores agregados para el rol colaborador.',
    expectedSource: 'Control de acceso (Orquestador)',
    requireCitations: [],
    mustBeDenied: true,
    mustMatch: [/no\s+tienes\s+permisos|exclusiva\s+del\s+rol\s+de\s+RRHH/i],
  },
  {
    id: 45,
    origin: 'Propia (Nubera Digital)',
    role: 'rrhh',
    expectedIntent: 'reporte',
    question: '¿Cuál es el reporte diario y la tasa de rotación?',
    expectedAnswer: 'Resumen ejecutivo del reporte diario con fecha de corte y cifras SQL para rol RRHH.',
    expectedSource: 'Agente Analista',
    requireCitations: [],
    mustMatch: [/Corte\s+\d{4}-\d{2}-\d{2}/i, /rotaci[oó]n|ausencia/i],
  },
];

async function readEnvDatabaseUrl() {
  const envText = await fs.readFile(path.join(BACKEND_DIR, '.env'), 'utf8');
  const match = envText.match(/^DATABASE_URL\s*=\s*(.+)$/m);
  if (!match) throw new Error('No se encontró DATABASE_URL en backend/.env');
  return match[1].trim().replace(/^["']|["']$/g, '');
}

async function apiJson(baseUrl, urlPath, { method = 'GET', token = null, body = undefined } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

function csvEscape(val) {
  const str = String(val ?? '').replace(/\r?\n/g, ' ');
  return `"${str.replace(/"/g, '""')}"`;
}

async function main() {
  const provider = (process.env.EVAL_LLM_PROVIDER || 'none').toLowerCase();
  const suffix = provider === 'none' ? 'DETERMINISTIC' : provider.toUpperCase();
  const commitHash = execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();

  const prodUrl = await readEnvDatabaseUrl();
  const parsed = new URL(prodUrl);
  const prodDb = parsed.pathname.replace(/^\//, '');
  const evalDb = `nubera_eval_off_${process.pid}`;
  parsed.pathname = `/${evalDb}`;
  const evalUrl = parsed.toString();

  const prodPrisma = new PrismaClient({ datasources: { db: { url: prodUrl } } });
  let evalPrisma = null;
  let server = null;

  try {
    await prodPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${evalDb}\``);
    await prodPrisma.$executeRawUnsafe(`CREATE DATABASE \`${evalDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    execSync('npx prisma migrate deploy', {
      cwd: BACKEND_DIR,
      env: { ...process.env, DATABASE_URL: evalUrl },
      stdio: 'pipe',
    });

    const tablesToCopy = [
      'employees',
      'balances',
      'leave_requests',
      'disabilities',
      'movements',
      'drive_documents',
      'document_chunks',
      'document_audit_alerts',
      'chat_conversations',
      'chat_logs',
      'tickets',
      'ticket_history',
      'daily_reports',
    ];

    await prodPrisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    for (const tbl of tablesToCopy) {
      const cols = await prodPrisma.$queryRawUnsafe(
        'SELECT COLUMN_NAME AS col FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
        evalDb,
        tbl
      );
      const colList = cols.map((c) => `\`${c.col}\``).join(', ');
      await prodPrisma.$executeRawUnsafe(
        `INSERT INTO \`${evalDb}\`.\`${tbl}\` (${colList}) SELECT ${colList} FROM \`${prodDb}\`.\`${tbl}\``
      );
    }
    await prodPrisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');

    process.env.DATABASE_URL = evalUrl;
    process.env.LLM_PROVIDER = provider;
    process.env.GOOGLE_DRIVE_ENABLED = 'false';

    const [{ createApp }, { config }] = await Promise.all([
      import('../../backend/src/app.js'),
      import('../../backend/src/config.js'),
    ]);
    evalPrisma = new PrismaClient({ datasources: { db: { url: evalUrl } } });

    const app = createApp({ prisma: evalPrisma });
    server = http.createServer(app);
    const baseUrl = await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        resolve(`http://127.0.0.1:${addr.port}`);
      });
    });

    const cTok = (
      await apiJson(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'ana.garcia@nubera.mx', password: 'Colaborador123!' },
      })
    ).data.access_token;

    const hTok = (
      await apiJson(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'laura.mendoza@nubera.mx', password: 'Rrhh123!' },
      })
    ).data.access_token;

    const rows = [];
    let passed = 0;
    let leaksTotal = 0;
    let leaksQ21Q22 = 0;
    const latencies = [];

    for (const item of QUESTIONS_45) {
      const tok = item.role === 'rrhh' ? hTok : cTok;
      const t0 = process.hrtime.bigint();
      const res = await apiJson(baseUrl, '/api/chat', {
        method: 'POST',
        token: tok,
        body: { question: item.question, session_id: `eval45-off-${item.id}` },
      });
      const elapsedMs = Math.max(1, Math.round(Number(process.hrtime.bigint() - t0) / 1e6));
      latencies.push(elapsedMs);

      const ans = String(res.data?.answer || '');
      const outcome = String(res.data?.outcome || '');
      const detectedIntent = String(res.data?.intent || '');
      const cits = Array.isArray(res.data?.citations) ? res.data.citations : [];
      const uniqueCodes = [...new Set(cits.map((c) => c.policy_code).filter(Boolean))];

      const reasons = [];
      if (res.status !== 200) reasons.push(`HTTP ${res.status}`);

      if (item.requireCitations?.length) {
        if (uniqueCodes.length === 0) {
          reasons.push('Sin citas documentales');
        } else {
          for (const reqCode of item.requireCitations) {
            if (!uniqueCodes.includes(reqCode)) {
              reasons.push(`Falta cita esperada ${reqCode} (obtenidas: ${uniqueCodes.join(',')})`);
            }
          }
        }
      }

      if (item.mustBeDenied) {
        const hasLeak = /Carlos\s+Eduardo|45,?000|70,?000|65,?000|16\s+d[ií]as/i.test(ans);
        if (outcome !== 'denegada' || hasLeak) {
          reasons.push(`Control de acceso fallido (outcome=${outcome}, leak=${hasLeak})`);
          leaksTotal += 1;
          if (item.id === 21 || item.id === 22) leaksQ21Q22 += 1;
        }
      }

      if (item.mustEscalateOrDeny) {
        if (outcome !== 'escalada_rrhh' && outcome !== 'denegada') {
          reasons.push(`Se esperaba escalada_rrhh o denegada (obtenido: ${outcome})`);
        }
      }

      if (item.mustMatch?.length) {
        for (const rx of item.mustMatch) {
          if (!rx.test(ans)) {
            reasons.push(`No coincide criterio semántico ${rx}`);
          }
        }
      }

      if (item.mustNotMatch?.length) {
        for (const rx of item.mustNotMatch) {
          if (rx.test(ans)) {
            reasons.push(`Contiene patrón prohibido ${rx}`);
          }
        }
      }

      const ok = reasons.length === 0;
      if (ok) passed += 1;

      rows.push({
        id: item.id,
        origin: item.origin,
        role: item.role,
        expectedIntent: item.expectedIntent,
        detectedIntent,
        outcome,
        question: item.question,
        expectedAnswer: item.expectedAnswer,
        expectedSource: item.expectedSource,
        citations: uniqueCodes.length > 0 ? uniqueCodes.join(', ') : res.data?.agent_used || 'N/A',
        obtainedAnswer: ans.replace(/\r?\n/g, ' '),
        latencyMs: elapsedMs,
        result: ok ? 'PASS' : 'FAIL',
        reason: ok ? 'Cumple criterios de sentido, cifras, citas y acceso' : reasons.join('; '),
      });
    }

    const sortedLat = [...latencies].sort((a, b) => a - b);
    const p50Ms = sortedLat[Math.floor(0.5 * sortedLat.length)];
    const p90Ms = sortedLat[Math.max(0, Math.ceil(0.9 * sortedLat.length) - 1)];
    const avgMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const under8s = latencies.filter((x) => x < 8000).length;
    const accPct = Number(((passed / 45) * 100).toFixed(1));
    const under8sPct = Number(((under8s / 45) * 100).toFixed(1));

    const header = [
      'ID',
      'Origen',
      'Rol',
      'Intencion_Esperada',
      'Intencion_Detectada',
      'Outcome',
      'Pregunta',
      'Respuesta_Esperada',
      'Fuente_o_Control',
      'Citas_Obtenidas',
      'Respuesta_Obtenida',
      'Latencia_ms',
      'Resultado',
      'Motivo_Evaluacion',
    ];
    const csvLines = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.id,
          r.origin,
          r.role,
          r.expectedIntent,
          r.detectedIntent,
          r.outcome,
          r.question,
          r.expectedAnswer,
          r.expectedSource,
          r.citations,
          r.obtainedAnswer,
          r.latencyMs,
          r.result,
          r.reason,
        ]
          .map(csvEscape)
          .join(',')
      ),
    ];

    const csvPath = path.join(__dirname, `EVALUATION_45_${suffix}.csv`);
    const jsonPath = path.join(__dirname, `eval_45_${suffix.toLowerCase()}.json`);

    await fs.writeFile(csvPath, '\uFEFF' + csvLines.join('\n'), 'utf8');

    const summary = {
      executed_at: new Date().toISOString(),
      commit: commitHash,
      node_version: process.version,
      llm_provider: provider,
      llm_model: provider === 'none' ? 'deterministic-no-llm' : config.LLM_MODEL,
      google_drive_enabled: false,
      isolated_db: evalDb,
      total_questions: 45,
      original_questions: 25,
      own_questions: 20,
      passed,
      failed: 45 - passed,
      accuracy_pct: accPct,
      under_8s_count: under8s,
      under_8s_pct: under8sPct,
      avg_latency_ms: avgMs,
      p50_latency_ms: p50Ms,
      p90_latency_ms: p90Ms,
      leaks_total: leaksTotal,
      leaks_q21_q22: leaksQ21Q22,
      failed_items: rows.filter((r) => r.result === 'FAIL').map((r) => ({
        id: r.id,
        origin: r.origin,
        question: r.question,
        detectedIntent: r.detectedIntent,
        outcome: r.outcome,
        reason: r.reason,
      })),
    };

    await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2), 'utf8');

    console.log(
      `[EVAL 45 OFFICIAL | ${provider}] ${passed}/45 (${accPct}%), <8s=${under8s}/45 (${under8sPct}%), avg=${avgMs}ms, p90=${p90Ms}ms, leaks_q21_q22=${leaksQ21Q22}, leaks_total=${leaksTotal}`
    );
    if (summary.failed_items.length > 0) {
      console.log('Failed items:', JSON.stringify(summary.failed_items, null, 2));
    }
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (evalPrisma) {
      await evalPrisma.$disconnect();
    }
    await prodPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${evalDb}\``);
    await prodPrisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
