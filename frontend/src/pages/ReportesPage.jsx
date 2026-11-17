import React, { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { apiRequest } from '../api';
import { normalizeArray } from '../utils/validators';

export default function ReportesPage() {
  const [dates, setDates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const d = normalizeArray(await apiRequest('/api/dashboard/dates'));
      setDates(d);
      if (d[0]) {
        const rep = await apiRequest(`/api/dashboard/report?report_date=${d[0]}`);
        setSelected(rep);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los reportes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function selectDate(d) {
    try {
      const rep = await apiRequest(`/api/dashboard/report?report_date=${d}`);
      setSelected(rep);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el reporte.');
    }
  }

  async function regenerateToday() {
    try {
      const rep = await apiRequest('/api/dashboard/report/generate', { method: 'POST' });
      setSelected(rep);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo regenerar el reporte.');
    }
  }

  function downloadCsv() {
    if (!selected) return;
    const rows = [
      ['fecha_corte', 'ausencias_hoy', 'solicitudes_pendientes', 'pendientes_mas_3d', 'incapacidades_activas', 'resueltas_pct', 'rotacion_pct'],
      [
        selected.report_date,
        selected.absences_today,
        selected.pending_requests,
        selected.pending_over_3_days,
        selected.active_disabilities,
        selected.resolved_without_escalation_pct,
        selected.turnover_rate_pct,
      ],
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-rrhh-${selected.report_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Reportes diarios guardados</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Histórico generado por el Agente Analista a las 7:00 a. m. (America/Mexico_City).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={regenerateToday}>
            <RefreshCw size={15} /> Regenerar corte de hoy
          </button>
          <button type="button" className="btn btn-primary" onClick={downloadCsv} disabled={!selected}>
            <Download size={15} /> Exportar CSV
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="card" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="card">Cargando reportes...</div>
      ) : (
        <div className="charts-grid-2">
          <div className="card">
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Fechas disponibles ({dates.length})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {dates.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`nav-item ${selected?.report_date === d ? 'active' : ''}`}
                  onClick={() => selectDate(d)}
                >
                  Corte del {d}
                </button>
              ))}
            </div>
          </div>

          {selected && (
            <div className="card">
              <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Detalle del corte {selected.report_date}</h2>
              <p style={{ fontSize: '0.9rem' }}>{selected.executive_summary}</p>
              <ul style={{ fontSize: '0.88rem', paddingLeft: '1.1rem' }}>
                <li>Ausencias del día: <strong>{selected.absences_today}</strong></li>
                <li>Pendientes: <strong>{selected.pending_requests}</strong> ({selected.pending_over_3_days} &gt; 3 días)</li>
                <li>Incapacidades activas: <strong>{selected.active_disabilities}</strong></li>
                <li>Rotación mensual: <strong>{selected.turnover_rate_pct}%</strong></li>
                <li>Volumen chat ayer: <strong>{selected.prev_day_chat_volume}</strong> ({selected.prev_day_avg_latency_ms} ms)</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
