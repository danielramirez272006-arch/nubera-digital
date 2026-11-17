import React, { useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../api';
import { formatDateTimeCdmx, normalizeArray } from '../utils/validators';
import DocumentViewerModal from '../components/DocumentViewerModal';

export default function DocumentosPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [viewingDocId, setViewingDocId] = useState(null);

  async function loadDocs() {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest('/api/documents');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los documentos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocs();
  }, []);

  async function triggerSync() {
    setSyncing(true);
    setError('');
    try {
      await apiRequest('/api/ingestion/sync', { method: 'POST' });
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al sincronizar con Google Drive.');
    } finally {
      setSyncing(false);
    }
  }

  async function resolveAlert(id) {
    try {
      await apiRequest(`/api/documents/alerts/${id}/resolve`, { method: 'POST' });
      loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar la alerta.');
    }
  }

  const alerts = normalizeArray(data?.alerts);
  const activeAlerts = alerts.filter((a) => a.status === 'activa' || (!a.resolved && a.status !== 'revisada' && a.status !== 'resuelta'));
  const historyAlerts = alerts.filter((a) => a.status === 'revisada' || a.status === 'resuelta' || a.resolved);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Estado documental y sincronización Drive</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Última sincronización (CDMX): {formatDateTimeCdmx(data?.last_synced_at)} ·{' '}
            {data?.total_active_documents ?? 0} documentos activos · {data?.total_chunks ?? 0} fragmentos indexados
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={triggerSync} disabled={syncing}>
          <RefreshCw size={15} /> {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
        </button>
      </div>

      {error && (
        <div role="alert" className="card" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <section className="card" aria-label="Estado actual de sincronización">
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: activeAlerts.length > 0 ? 'var(--warning)' : 'var(--success)' }}>
          {activeAlerts.length > 0 ? (
            <>
              <AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Alertas activas que requieren revisión ({activeAlerts.length})
            </>
          ) : (
            <>
              <CheckCircle2 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Sincronización saludable: 0 alertas activas
            </>
          )}
        </h2>
        {activeAlerts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            {activeAlerts.map((a) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', padding: '0.6rem 0.75rem', background: 'var(--warning-soft)', borderRadius: 8 }}>
                <div style={{ fontSize: '0.86rem' }}>
                  <strong>{a.title}</strong> ({a.alert_type} · {a.occurrence_count}x) — {a.detail}
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    Detectada: {formatDateTimeCdmx(a.created_at)} · Última ocurrencia: {formatDateTimeCdmx(a.last_seen_at)}
                  </div>
                </div>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }} onClick={() => resolveAlert(a.id)}>
                  Marcar revisada
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {historyAlerts.length > 0 && (
        <section className="card" aria-label="Historial de alertas">
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Historial de alertas ({historyAlerts.length})</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Tipo</th>
                  <th>Ocurrencias</th>
                  <th>Detección (CDMX)</th>
                  <th>Última ocurrencia</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {historyAlerts.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.title}</strong></td>
                    <td>{a.alert_type}</td>
                    <td>{a.occurrence_count}x</td>
                    <td>{formatDateTimeCdmx(a.created_at)}</td>
                    <td>{formatDateTimeCdmx(a.last_seen_at)}</td>
                    <td>
                      <span className={`badge ${a.status === 'resuelta' ? 'badge-success' : 'badge-accent'}`}>
                        {a.status === 'resuelta' ? 'Resuelta' : 'Revisada'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Documentos indexados</h2>
        {loading ? (
          <div>Cargando documentos...</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Título</th>
                  <th>Versión</th>
                  <th>Vigencia</th>
                  <th>Responsable</th>
                  <th>Fragmentos</th>
                  <th>Estado</th>
                  <th>Enlace</th>
                </tr>
              </thead>
              <tbody>
                {normalizeArray(data?.documents).map((doc) => (
                  <tr key={doc.id}>
                    <td><strong>{doc.policy_code}</strong></td>
                    <td>{doc.title}</td>
                    <td>{doc.version}</td>
                    <td>{doc.effective_date}</td>
                    <td>{doc.owner}</td>
                    <td>{doc.chunks_count}</td>
                    <td><span className={`badge ${doc.status === 'activo' ? 'badge-success' : 'badge-danger'}`}>{doc.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="chip-btn"
                          style={{ padding: '0.2rem 0.55rem', fontSize: '0.76rem', fontWeight: 600 }}
                          onClick={() => setViewingDocId(doc.drive_file_id)}
                        >
                          Ver documento
                        </button>
                        <a href={doc.drive_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          Drive <ExternalLink size={12} />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DocumentViewerModal driveFileId={viewingDocId} onClose={() => setViewingDocId(null)} />
    </div>
  );
}
