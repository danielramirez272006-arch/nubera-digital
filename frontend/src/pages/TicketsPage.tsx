import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { apiRequest } from '../api';
import { TicketOut } from '../types';

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesMap, setNotesMap] = useState<Record<number, string>>({});

  async function loadTickets() {
    setLoading(true);
    try {
      const res = await apiRequest<TicketOut[]>('/api/tickets');
      setTickets(res);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTickets();
  }, []);

  async function updateStatus(id: number, status: 'en_proceso' | 'resuelto' | 'cerrado') {
    const notes = notesMap[id]?.trim() || `Actualización de estado a ${status}.`;
    await apiRequest(`/api/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes }),
    });
    loadTickets();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Atención de tickets</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Casos escalados por colaboradores. Los casos sensibles se muestran únicamente al personal autorizado.
        </p>
      </div>

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
                  <span className="badge badge-accent">{t.status.replace('_', ' ').toUpperCase()}</span>
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
