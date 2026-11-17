import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ShieldAlert, Calendar, AlertTriangle, RefreshCw, Download } from 'lucide-react';
import { apiRequest, ApiError } from '../api';
import { useAuth } from '../AuthContext';
import { DashboardReport } from '../types';

export default function DashboardPage() {
  const { user } = useAuth();
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [deptFilter, setDeptFilter] = useState('Todos');
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  async function loadReport(dateStr: string) {
    setLoading(true);
    setError('');
    try {
      const qs = dateStr ? `?report_date=${encodeURIComponent(dateStr)}` : '';
      const data = await apiRequest<DashboardReport>(`/api/dashboard/report${qs}`);
      setReport(data);
      setSelectedDate(data.report_date);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo cargar el reporte.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user && user.role !== 'rrhh') {
      setForbidden(true);
      setLoading(false);
      return;
    }

    apiRequest<string[]>('/api/dashboard/dates')
      .then((dateList) => {
        setDates(dateList);
        return loadReport(dateList[0] || '');
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setError(err instanceof Error ? err.message : 'Error al cargar fechas de reportes.');
        setLoading(false);
      });
  }, [user]);

  async function handleRefreshToday() {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<DashboardReport>('/api/dashboard/report/generate', { method: 'POST' });
      setReport(data);
      setSelectedDate(data.report_date);
      const dateList = await apiRequest<string[]>('/api/dashboard/dates');
      setDates(dateList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo regenerar el reporte.');
    } finally {
      setLoading(false);
    }
  }

  function exportReportJson() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-rrhh-${report.report_date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (forbidden) {
    return (
      <div className="card" role="alert" style={{ maxWidth: 540, margin: '2rem auto', textAlign: 'center', padding: '2rem' }}>
        <ShieldAlert size={40} color="#b91c1c" style={{ marginBottom: '0.75rem' }} aria-hidden="true" />
        <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.35rem', color: 'var(--danger)' }}>Acceso denegado</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          Esta vista y sus endpoints están protegidos exclusivamente para personal con rol de RRHH.
        </p>
      </div>
    );
  }

  const allPending = report?.payload_json?.pending_requests_list || [];
  const departments = ['Todos', ...(report?.payload_json?.departments_catalog || Array.from(new Set(allPending.map((p) => p.department))).sort())];
  const filteredPending = deptFilter === 'Todos' ? allPending : allPending.filter((p) => p.department === deptFilter);
  const filteredOver3 = filteredPending.filter((p) => p.is_over_3_days).length;

  const absentRecords = report?.payload_json?.today_absent_records || [];
  const filteredAbsentRecords = deptFilter === 'Todos' ? absentRecords : absentRecords.filter((r) => r.department === deptFilter);
  const filteredAbsencesToday = deptFilter === 'Todos' ? (report?.absences_today ?? 0) : new Set(filteredAbsentRecords.map((r) => r.employee_id)).size;
  const filteredDisabilitiesToday = deptFilter === 'Todos' ? (report?.active_disabilities ?? 0) : new Set(filteredAbsentRecords.filter((r) => r.is_disability).map((r) => r.employee_id)).size;

  const filteredByType = deptFilter === 'Todos'
    ? (report?.payload_json?.absences_by_type || [])
    : Object.entries(
        filteredAbsentRecords.reduce<Record<string, Set<number>>>((acc, r) => {
          if (!acc[r.request_type]) acc[r.request_type] = new Set();
          acc[r.request_type].add(r.employee_id);
          return acc;
        }, {})
      ).map(([name, s]) => ({ name, value: s.size }));

  const filteredByDept = deptFilter === 'Todos'
    ? (report?.payload_json?.absences_by_department || [])
    : (report?.payload_json?.absences_by_department || []).filter((d) => d.department === deptFilter);

  const trendData = (report?.payload_json?.absences_last_30_days || []).slice(-periodDays);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Dashboard privado de RRHH</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Reporte diario a las 7:00 a. m. (America/Mexico_City) · Fecha de corte:{' '}
            <strong>{report?.report_date || '—'}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <label htmlFor="report-date-select" style={{ fontSize: '0.84rem', fontWeight: 600 }}>
            <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} aria-hidden="true" />
            Corte:
          </label>
          <select
            id="report-date-select"
            className="input"
            style={{ width: 'auto', minWidth: 145 }}
            value={selectedDate}
            onChange={(e) => loadReport(e.target.value)}
            disabled={loading}
          >
            {dates.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <label htmlFor="dept-filter" style={{ fontSize: '0.84rem', fontWeight: 600 }}>Depto:</label>
          <select
            id="dept-filter"
            className="input"
            style={{ width: 'auto', minWidth: 130 }}
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <label htmlFor="period-filter" style={{ fontSize: '0.84rem', fontWeight: 600 }}>Periodo:</label>
          <select
            id="period-filter"
            className="input"
            style={{ width: 'auto' }}
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
          >
            <option value={7}>7 días</option>
            <option value={15}>15 días</option>
            <option value={30}>30 días</option>
          </select>

          <button type="button" className="btn btn-secondary" onClick={handleRefreshToday} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" />
            <span>Actualizar</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={exportReportJson} disabled={!report}>
            <Download size={15} aria-hidden="true" />
            <span>Exportar JSON</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="card" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {loading && !report ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
          Cargando reporte diario guardado...
        </div>
      ) : report ? (
        <>
          <section className="card" aria-label="Resumen ejecutivo">
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: 'var(--accent)' }}>Resumen ejecutivo del día</h2>
            <p style={{ margin: 0, fontSize: '0.94rem', color: 'var(--text-primary)' }}>{report.executive_summary}</p>
          </section>

          <div className="kpi-grid-4">
            <div className="card">
              <div className="kpi-label">Ausencias de hoy {deptFilter !== 'Todos' ? `(${deptFilter})` : ''}</div>
              <div className="kpi-value">{filteredAbsencesToday}</div>
            </div>
            <div className="card">
              <div className="kpi-label">Solicitudes pendientes {deptFilter !== 'Todos' ? `(${deptFilter})` : ''}</div>
              <div className="kpi-value">
                {filteredPending.length}{' '}
                {filteredOver3 > 0 && (
                  <span className="badge badge-warning" style={{ fontSize: '0.75rem', verticalAlign: 'middle' }}>
                    {filteredOver3} &gt; 3 días
                  </span>
                )}
              </div>
            </div>
            <div className="card">
              <div className="kpi-label">Incapacidades activas {deptFilter !== 'Todos' ? `(${deptFilter})` : ''}</div>
              <div className="kpi-value">{filteredDisabilitiesToday}</div>
            </div>
            <div className="card">
              <div className="kpi-label">Resueltas sin escalar (global)</div>
              <div className="kpi-value" style={{ color: 'var(--accent)' }}>
                {report.resolved_without_escalation_pct}%
              </div>
            </div>
          </div>

          <div className="charts-grid-2">
            <section className="card" aria-label="Tendencia de ausencias">
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Ausencias de los últimos {periodDays} días</h2>
              <div style={{ width: '100%', height: 250 }}>
                <ResponsiveContainer>
                  <AreaChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="absences" name="Ausencias" stroke="#0f766e" fill="#ccfbf1" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Resumen accesible: En los últimos {periodDays} días se registraron{' '}
                {trendData.reduce((acc, d) => acc + d.absences, 0)} días-persona de ausencia acumulada; hoy hay {report.absences_today} ausencias activas.
              </p>
            </section>

            <section className="card" aria-label="Cinco temas más consultados">
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Top 5 temas más consultados</h2>
              <div style={{ width: '100%', height: 250 }}>
                <ResponsiveContainer>
                  <BarChart data={report.payload_json?.top_5_topics || []} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="topic" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Consultas" fill="#0f2942" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Resumen accesible: El tema más consultado es{' '}
                {report.payload_json?.top_5_topics?.[0]?.topic || 'N/A'} ({report.payload_json?.top_5_topics?.[0]?.count || 0} consultas).
              </p>
            </section>
          </div>

          <div className="kpi-grid-5">
            <div className="card">
              <div className="kpi-label">Días incapacidad (mes)</div>
              <div className="kpi-value">{report.monthly_disability_days}</div>
            </div>
            <div className="card">
              <div className="kpi-label">Ingresos (mes)</div>
              <div className="kpi-value">{report.monthly_hires}</div>
            </div>
            <div className="card">
              <div className="kpi-label">Salidas (mes)</div>
              <div className="kpi-value">{report.monthly_exits}</div>
            </div>
            <div className="card">
              <div className="kpi-label">Tasa de rotación</div>
              <div className="kpi-value">{report.turnover_rate_pct}%</div>
            </div>
            <div className="card">
              <div className="kpi-label">Colaboradores &gt; 20 días vac.</div>
              <div className="kpi-value">{report.employees_over_20_vacation_days}</div>
            </div>
          </div>

          <div className="charts-grid-2">
            <section className="card">
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Desglose de ausencias del día (excluye teletrabajo)</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.88rem' }}>
                <div>
                  <strong style={{ color: 'var(--text-secondary)' }}>Por tipo</strong>
                  {filteredByType.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)' }}>Sin ausencias para este departamento.</p>
                  ) : (
                    <ul style={{ paddingLeft: '1.1rem', margin: '0.5rem 0 0' }}>
                      {filteredByType.map((t) => (
                        <li key={t.name}>{t.name}: <strong>{t.value}</strong></li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <strong style={{ color: 'var(--text-secondary)' }}>Por departamento</strong>
                  {filteredByDept.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)' }}>Sin ausencias para este departamento.</p>
                  ) : (
                    <ul style={{ paddingLeft: '1.1rem', margin: '0.5rem 0 0' }}>
                      {filteredByDept.map((d) => (
                        <li key={d.department}>{d.department}: <strong>{d.count}</strong></li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            <section className="card">
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Asistente del día anterior y preguntas sin respaldo</h2>
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                <div>Volumen ayer: <strong>{report.prev_day_chat_volume} consultas</strong></div>
                <div>Latencia promedio: <strong>{report.prev_day_avg_latency_ms} ms</strong></div>
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Preguntas sin respaldo documental (agrupadas):</strong>
                {(report.payload_json?.unanswered_questions || []).length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', margin: '0.4rem 0 0' }}>Ninguna registrada.</p>
                ) : (
                  <ul style={{ paddingLeft: '1.1rem', margin: '0.4rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {report.payload_json.unanswered_questions.slice(0, 6).map((q, idx) => (
                      <li key={idx}>
                        <span>{q.question}</span>{' '}
                        <span className="badge badge-accent">{q.count || 1}x</span>{' '}
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          ({q.topic} · última: {new Date(q.last_asked_at || q.created_at || '').toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          <section className="card" aria-label="Solicitudes pendientes de aprobación">
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>
              Solicitudes pendientes ({filteredPending.length})
            </h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>Departamento</th>
                    <th>Tipo</th>
                    <th>Periodo</th>
                    <th>Días</th>
                    <th>Espera</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPending.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No hay solicitudes pendientes para el filtro seleccionado.
                      </td>
                    </tr>
                  ) : (
                    filteredPending.map((req) => (
                      <tr key={req.id} className={req.is_over_3_days ? 'row-alert' : ''}>
                        <td><strong>{req.employee_name}</strong></td>
                        <td>{req.department}</td>
                        <td>{req.request_type}</td>
                        <td>{req.start_date} al {req.end_date}</td>
                        <td>{req.days_count}</td>
                        <td>
                          {req.is_over_3_days ? (
                            <span className="badge badge-danger">
                              <AlertTriangle size={12} aria-hidden="true" />
                              {req.days_waiting} días (&gt;3 días)
                            </span>
                          ) : (
                            <span className="badge badge-success">{req.days_waiting} días</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Definiciones de indicadores:</strong>{' '}
            <em>Ausencias de hoy</em> cuenta solicitudes aprobadas vigentes en la fecha de corte (las ausencias de varios días se contabilizan en cada día calendario del intervalo).{' '}
            <em>Tasa de rotación</em> = (Salidas del mes / Plantilla activa) × 100.{' '}
            <em>Resueltas sin escalar</em> = (Consultas con resultado resuelta / Total de consultas) × 100.
          </section>
        </>
      ) : null}
    </div>
  );
}
