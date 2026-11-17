import React, { useEffect, useState } from 'react';
import { RefreshCw, Ticket } from 'lucide-react';
import { apiRequest } from '../api';
import { formatDateCdmx, normalizeArray } from '../utils/validators';

export default function MisTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadTickets() {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest('/api/tickets/mine');
      setTickets(normalizeArray(res));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus tickets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTickets();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Mis tickets</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Seguimiento de solicitudes escaladas a RRHH e historial de atención.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={loadTickets}>
          <RefreshCw size={15} /> Actualizar
        </button>
      </div>

      {error && (
        <div role="alert" className="card" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          <p style={{ margin: '0 0 0.5rem' }}>{error}</p>
          <button type="button" className="btn btn-secondary" onClick={loadTickets}>
            <RefreshCw size={14} /> Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <div className="card">Cargando tickets...</div>
      ) : tickets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          <Ticket size={28} color="#0f766e" style={{ marginBottom: 8 }} />
          <div>No tienes tickets abiertos ni históricos.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tickets.map((t) => (
            <article key={t.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div>
                  <strong>{t.folio}</strong> · {t.topic}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span className="badge badge-accent">{String(t.status).replace('_', ' ').toUpperCase()}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {formatDateCdmx(t.created_at)}
                  </span>
                </div>
              </div>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', whiteSpace: 'pre-line' }}>{t.confirmed_summary}</p>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: '0.6rem' }}>
                <strong>Historial de atención (Responsable: {t.assigned_to}):</strong>
                <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
                  {normalizeArray(t.history).map((h) => (
                    <li key={h.id}>
                      <strong>{h.action}</strong> ({h.actor_name}): {h.notes}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
