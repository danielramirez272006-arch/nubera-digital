import React, { useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../api';
import { DocumentsStatusResponse } from '../types';
import DocumentViewerModal from '../components/DocumentViewerModal';

export default function DocumentosPage() {
  const [data, setData] = useState<DocumentsStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);

  async function loadDocs() {
    setLoading(true);
    try {
      const res = await apiRequest<DocumentsStatusResponse>('/api/documents');
      setData(res);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocs();
  }, []);

  async function triggerSync() {
    setSyncing(true);
    try {
      await apiRequest('/api/ingestion/sync', { method: 'POST' });
      await loadDocs();
    } finally {
      setSyncing(false);
    }
  }

  async function resolveAlert(id: number) {
    await apiRequest(`/api/documents/alerts/${id}/resolve`, { method: 'POST' });
    loadDocs();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Estado documental y sincronización Drive</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Última sincronización: {data?.last_synced_at ? new Date(data.last_synced_at).toLocaleString('es-MX') : '—'} ·{' '}
            {data?.total_active_documents ?? 0} documentos activos · {data?.total_chunks ?? 0} fragmentos indexados
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={triggerSync} disabled={syncing}>
          <RefreshCw size={15} /> {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
        </button>
      </div>

      {data && data.alerts.length > 0 && (
        <section className="card" aria-label="Alertas documentales">
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: 'var(--warning)' }}>
            <AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Alertas de calidad y seguridad documental ({data.alerts.filter((a) => !a.resolved).length} activas)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {data.alerts.map((a) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: a.resolved ? 'var(--bg-page)' : 'var(--warning-soft)', borderRadius: 8 }}>
                <div style={{ fontSize: '0.86rem' }}>
                  <strong>{a.title}</strong> ({a.alert_type}) — {a.detail}
                </div>
                {a.resolved ? (
                  <span className="badge badge-success"><CheckCircle2 size={12} /> Resuelta</span>
                ) : (
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }} onClick={() => resolveAlert(a.id)}>
                    Marcar revisada
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Documentos indexados en pgvector</h2>
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
                {(data?.documents || []).map((doc) => (
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
