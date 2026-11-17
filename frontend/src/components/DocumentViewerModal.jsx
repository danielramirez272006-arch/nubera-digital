import React, { useEffect, useState } from 'react';
import { X, ExternalLink, FileText } from 'lucide-react';
import { apiRequest } from '../api';
import { normalizeArray } from '../utils/validators';

export default function DocumentViewerModal({ driveFileId, onClose }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!driveFileId) {
      setDoc(null);
      return;
    }
    setLoading(true);
    setError('');
    apiRequest(`/api/documents/${encodeURIComponent(driveFileId)}/content`)
      .then((res) => setDoc(res))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el documento.'))
      .finally(() => setLoading(false));
  }, [driveFileId]);

  if (!driveFileId) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visor de documento de política"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 41, 66, 0.55)',
        zIndex: 60,
        display: 'grid',
        placeItems: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '1.5rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FileText size={22} color="#0f766e" aria-hidden="true" />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{doc?.title || 'Cargando documento...'}</h2>
              {doc && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Código: {doc.policy_code} · Versión: {doc.version} · Vigencia: {doc.effective_date} · Responsable: {doc.owner}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            aria-label="Cerrar visor"
            onClick={onClose}
            style={{ padding: '0.35rem 0.6rem' }}
          >
            <X size={18} />
          </button>
        </div>

        {loading && <p style={{ color: 'var(--text-secondary)' }}>Cargando contenido del documento...</p>}
        {error && (
          <div role="alert" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', padding: '0.75rem', borderRadius: 8 }}>
            {error}
          </div>
        )}

        {doc && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {normalizeArray(doc.sections).map((sec, idx) => (
              <section
                key={idx}
                style={{
                  background: 'var(--bg-page)',
                  padding: '0.9rem 1rem',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem', color: 'var(--accent)' }}>{sec.section}</h3>
                <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{sec.content}</p>
              </section>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                ID de Drive: <code>{doc.drive_file_id}</code>
              </span>
              <a
                href={doc.drive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}
              >
                <span>Abrir enlace externo de Drive</span>
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
