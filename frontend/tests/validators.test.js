import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDateCdmx,
  formatDateTimeCdmx,
  normalizeArray,
  validateChatMessage,
  validateLeaveRequestInput,
  validateLoginResponse,
} from '../src/utils/validators.js';

test('normalizeArray devuelve arreglo o arreglo vacío', () => {
  assert.deepEqual(normalizeArray([1, 2]), [1, 2]);
  assert.deepEqual(normalizeArray(null), []);
  assert.deepEqual(normalizeArray('texto'), []);
});

test('validateLoginResponse valida token y rol de usuario', () => {
  const valid = {
    access_token: 'abc.def.ghi',
    user: { id: 1, role: 'colaborador' },
  };
  assert.deepEqual(validateLoginResponse(valid), valid);
  assert.throws(() => validateLoginResponse({ access_token: 'x' }), /Respuesta de autenticación inválida/);
  assert.throws(() => validateLoginResponse(null), /Respuesta de autenticación inválida/);
});

test('validateChatMessage normaliza citations y exige answer string', () => {
  const res = validateChatMessage({ answer: 'Hola', citations: null });
  assert.equal(res.answer, 'Hola');
  assert.deepEqual(res.citations, []);
  assert.throws(() => validateChatMessage({ answer: 123 }), /formato esperado/);
});

test('validateLeaveRequestInput valida tipo y rango de fechas', () => {
  assert.equal(
    validateLeaveRequestInput({
      requestType: 'vacaciones',
      startDate: '2026-12-01',
      endDate: '2026-12-05',
    }),
    null
  );
  assert.match(
    validateLeaveRequestInput({ requestType: 'otro', startDate: '2026-12-01', endDate: '2026-12-02' }),
    /Tipo de solicitud inválido/
  );
  assert.match(
    validateLeaveRequestInput({ requestType: 'vacaciones', startDate: '', endDate: '2026-12-02' }),
    /fecha de inicio/
  );
  assert.match(
    validateLeaveRequestInput({ requestType: 'vacaciones', startDate: '2026-12-10', endDate: '2026-12-05' }),
    /igual o posterior/
  );
  assert.match(
    validateLeaveRequestInput({ requestType: 'vacaciones', startDate: '2027-02-31', endDate: '2027-03-02' }),
    /Fecha inválida/
  );
  assert.match(
    validateLeaveRequestInput({ requestType: 'vacaciones', startDate: '2026-13-01', endDate: '2026-13-02' }),
    /Fecha inválida/
  );
  assert.equal(
    validateLeaveRequestInput({ requestType: 'vacaciones', startDate: '2024-02-29', endDate: '2024-02-29' }),
    null
  );
});

test('formateadores CDMX manejan valores nulos e inválidos', () => {
  assert.equal(formatDateCdmx(null), '—');
  assert.equal(formatDateTimeCdmx(undefined), '—');
  assert.equal(formatDateCdmx('fecha-invalida'), 'fecha-invalida');
  assert.ok(formatDateCdmx('2026-11-17T12:00:00Z').includes('2026'));
});
