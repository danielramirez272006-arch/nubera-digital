import React, { useEffect, useState } from 'react';
import { Check, X, Download } from 'lucide-react';
import { apiRequest } from '../api';
import { LeaveRequestOut } from '../types';

export default function SolicitudesPage() {
  const [requests, setRequests] = useState<LeaveRequestOut[]>([]);
  const [statusFilter, setStatusFilter] = useState('pendiente');
  const [loading, setLoading] = useState(true);

  async function loadRequests(st: string) {
    setLoading(true);
    try {
      const qs = st ? `?status_filter=${encodeURIComponent(st)}` : '';
      const res = await apiRequest<LeaveRequestOut[]>(`/api/requests${qs}`);
      setRequests(res);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests(statusFilter);
  }, [statusFilter]);

  async function decide(id: number, decision: 'aprobada' | 'rechazada') {
    await apiRequest(`/api/requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: decision, approver_notes: `Resuelta por RRHH (${decision}).` }),
    });
    loadRequests(statusFilter);
  }

  function exportCsv() {
    const header = ['id', 'colaborador', 'departamento', 'tipo', 'inicio', 'fin', 'dias', 'estado'];
    const rows = requests.map((r) => [
      r.id,
      `"${(r.employee_name || '').replace(/"/g, '""')}"`,
      `"${(r.department || '').replace(/"/g, '""')}"`,
      r.request_type,
      r.start_date,
      r.end_date,
      r.days_count,
      r.status,
    ]);
    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solicitudes-rrhh-${statusFilter || 'todas'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Gestión de solicitudes</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Revisión y aprobación de vacaciones, permisos e incapacidades.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            aria-label="Filtrar por estado"
            className="input"
            style={{ width: 'auto' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="pendiente">Pendientes</option>
            <option value="aprobada">Aprobadas</option>
            <option value="rechazada">Rechazadas</option>
            <option value="">Todas</option>
          </select>
          <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={requests.length === 0}>
            <Download size={15} aria-hidden="true" /> Exportar CSV
          </button>
        </div>
      </div>

      <section className="card">
        {loading ? (
          <div>Cargando solicitudes...</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Departamento</th>
                  <th>Tipo</th>
                  <th>Periodo</th>
                  <th>Días</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No hay solicitudes con este filtro.
                    </td>
                  </tr>
                ) : (
                  requests.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.employee_name}</strong></td>
                      <td>{r.department}</td>
                      <td>{r.request_type.replace('_', ' ')}</td>
                      <td>{r.start_date} al {r.end_date}</td>
                      <td>{r.days_count}</td>
                      <td><span className="badge badge-accent">{r.status.toUpperCase()}</span></td>
                      <td>
                        {r.status === 'pendiente' ? (
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button type="button" className="btn btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }} onClick={() => decide(r.id, 'aprobada')}>
                              <Check size={14} /> Aprobar
                            </button>
                            <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }} onClick={() => decide(r.id, 'rechazada')}>
                              <X size={14} /> Rechazar
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{r.approver_notes || 'Resuelta'}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
