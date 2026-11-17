const SENSITIVE_KEYWORDS = [
  'acoso',
  'hostigamiento',
  'discriminacion',
  'nom-035',
  'etica',
  'incapacidad',
  'salud',
  'enfermedad',
  'salario',
  'sueldo',
  'nomina',
];

export function buildTicketSummary(question, topic, employee) {
  const qLow = String(question || '').toLowerCase();
  const isSensitive = SENSITIVE_KEYWORDS.some((k) => qLow.includes(k));
  const summary =
    `Colaborador: ${employee.fullName} (${employee.employeeCode}, ${employee.department})\n` +
    `Tema: ${topic}\n` +
    `Consulta original: ${question}\n` +
    `Motivo de escalamiento: No se encontró respaldo suficiente en las políticas vigentes o requiere atención directa de RRHH.`;
  return { summary, isSensitive };
}
