import React, { useEffect, useState } from 'react';
import { Lock, Download } from 'lucide-react';
import { apiRequest } from '../api';
import { normalizeArray } from '../utils/validators';

export default function TicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notesMap, setNotesMap] = useState({});

  async function loadTickets() {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest('/api/tickets');
      setTickets(normalizeArray(res));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los tickets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTickets();
  }, []);

  async function updateStatus(id, status) {
    try {
      const notes = notesMap[id]?.trim() || `Actualización de estado a ${status}.`;
      await apiRequest(`/api/tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes }),
      });
      loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el ticket.');
    }
  }

  function exportCsv() {
    const header = ['folio', 'colaborador', 'departamento', 'tema', 'estado', 'responsable', 'sensible'];
    const rows = tickets.map((t) => [
      t.folio,
      `"${(t.employee_name || '').replace(/"/g, '""')}"`,
      `"${(t.department || '').replace(/"/g, '""')}"`,
      `"${(t.topic || '').replace(/"/g, '""')}"`,
      t.status,
      `"${(t.assigned_to || '').replace(/"/g, '""')}"`,
      t.is_sensitive ? 'si' : 'no',
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tickets-rrhh.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Atención de tickets</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Casos escalados por colaboradores. Los casos sensibles se muestran únicamente al personal autorizado.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={tickets.length === 0}>
          <Download size={15} aria-hidden="true" /> Exportar CSV
        </button>
      </div>

      {error && (
        <div role="alert" className="card" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="card">Cargando tickets...</div>
      ) : tickets.length === 0 ? (
        <div className="card">No hay tickets registrados.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tickets.map((t) => (
            <article key={t.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div>
                  <strong>{t.folio}</strong> · {t.employee_name} ({t.department}) — <em>{t.topic}</em>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  {t.is_sensitive && (
                    <span className="badge badge-danger"><Lock size={12} /> Caso sensible</span>
                  )}
                  <span className="badge badge-accent">{String(t.status).replace('_', ' ').toUpperCase()}</span>
                </div>
              </div>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', whiteSpace: 'pre-line' }}>{t.confirmed_summary}</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  className="input"
                  style={{ flex: 1, minWidth: 220 }}
                  placeholder="Agregar nota de atención..."
                  value={notesMap[t.id] || ''}
                  onChange={(e) => setNotesMap({ ...notesMap, [t.id]: e.target.value })}
                />
                <button type="button" className="btn btn-secondary" onClick={() => updateStatus(t.id, 'en_proceso')}>En proceso</button>
                <button type="button" className="btn btn-primary" onClick={() => updateStatus(t.id, 'resuelto')}>Marcar resuelto</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
