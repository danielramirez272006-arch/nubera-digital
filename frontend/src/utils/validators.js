/**
 * Validaciones en tiempo de ejecución y formateadores para respuestas de la API.
 */

export function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function validateLoginResponse(data) {
  if (!data || typeof data.access_token !== 'string' || !data.user || !data.user.role) {
    throw new Error('Respuesta de autenticación inválida del servidor.');
  }
  return data;
}

export function validateChatMessage(msg) {
  if (!msg || typeof msg.answer !== 'string') {
    throw new Error('La respuesta del asistente no tiene el formato esperado.');
  }
  return {
    ...msg,
    citations: normalizeArray(msg.citations),
  };
}

export function validateLeaveRequestInput({ requestType, startDate, endDate }) {
  const allowed = ['vacaciones', 'permiso_con_goce', 'permiso_sin_goce', 'home_office'];
  if (!allowed.includes(requestType)) {
    return 'Tipo de solicitud inválido.';
  }
  if (!startDate || !endDate) {
    return 'Debes indicar fecha de inicio y fecha de fin.';
  }
  if (endDate < startDate) {
    return 'La fecha de fin debe ser igual o posterior a la fecha de inicio.';
  }
  return null;
}

export function formatDateTimeCdmx(iso) {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  return parsed.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
}

export function formatDateCdmx(iso) {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  return parsed.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
}
