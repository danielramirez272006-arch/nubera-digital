import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, MessageSquare, RefreshCw, Plus } from 'lucide-react';
import { apiRequest } from '../api';
import { MyDataResponse } from '../types';

export default function MisDatosPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<MyDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [reqType, setReqType] = useState<'vacaciones' | 'permiso_con_goce' | 'permiso_sin_goce' | 'home_office'>('vacaciones');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [formMsg, setFormMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function fetchMyData() {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<MyDataResponse>('/api/me/data');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus datos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMyData();
  }, []);

  function askInChat(query: string) {
    navigate(`/consultas?q=${encodeURIComponent(query)}`);
  }

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    setSubmitting(true);
    try {
      await apiRequest('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          request_type: reqType,
          start_date: startDate,
          end_date: endDate,
          reason: reason || undefined,
        }),
      });
      setFormMsg({ type: 'ok', text: 'Solicitud registrada correctamente y enviada a revisión.' });
      setShowForm(false);
      setStartDate('');
      setEndDate('');
      setReason('');
      await fetchMyData();
    } catch (err) {
      setFormMsg({ type: 'err', text: err instanceof Error ? err.message : 'No se pudo registrar la solicitud.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="card">Cargando tus datos personales...</div>;
  }

  if (error) {
    return (
      <div className="card" role="alert" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
        <p style={{ margin: '0 0 0.75rem' }}>{error}</p>
        <button type="button" className="btn btn-secondary" onClick={fetchMyData}>
          <RefreshCw size={15} /> Reintentar
        </button>
      </div>
    );
  }

  const bal = data?.balances?.[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Mis datos</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Última actualización: {data?.updated_at ? new Date(data.updated_at).toLocaleString('es-MX') : '—'}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={fetchMyData}>
          <RefreshCw size={15} aria-hidden="true" />
          <span>Actualizar</span>
        </button>
      </div>

      <div className="kpi-grid-4" style={{ marginBottom: 0 }}>
        <div className="card">
          <div className="kpi-label">Saldo de vacaciones ({bal?.year})</div>
          <div className="kpi-value" style={{ color: 'var(--accent)' }}>{bal ? `${bal.available_days} días` : '—'}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            Vigencia: {bal?.expiration_date || '—'}
          </div>
          <button
            type="button"
            className="chip-btn"
            style={{ marginTop: 10 }}
            onClick={() => askInChat('¿Cuántos días me quedan y puedo usarlos el próximo año?')}
          >
            <MessageSquare size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Consultar en chat
          </button>
        </div>

        <div className="card">
          <div className="kpi-label">Próxima fecha de pago</div>
          <div className="kpi-value" style={{ fontSize: '1.35rem' }}>
            <Calendar size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {data?.employee.next_payment_date || '—'}
          </div>
          <button
            type="button"
            className="chip-btn"
            style={{ marginTop: 14 }}
            onClick={() => askInChat('¿Cuándo es mi próximo pago semanal?')}
          >
            <MessageSquare size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Consultar pago
          </button>
        </div>

        <div className="card">
          <div className="kpi-label">Próxima evaluación de desempeño</div>
          <div className="kpi-value" style={{ fontSize: '1.35rem' }}>
            <Calendar size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {data?.employee.next_review_date || '—'}
          </div>
          <button
            type="button"
            className="chip-btn"
            style={{ marginTop: 14 }}
            onClick={() => askInChat('¿Cuándo es mi próxima evaluación de desempeño y cómo funciona?')}
          >
            <MessageSquare size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Consultar evaluación
          </button>
        </div>

        <div className="card">
          <div className="kpi-label">Puesto y antigüedad</div>
          <div style={{ fontWeight: 600, marginTop: 6 }}>{data?.employee.position}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {data?.employee.department} · Ingreso: {data?.employee.hire_date}
          </div>
        </div>
      </div>

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Mis solicitudes recientes</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }} onClick={() => setShowForm((v) => !v)}>
              <Plus size={14} aria-hidden="true" /> {showForm ? 'Cerrar formulario' : 'Nueva solicitud'}
            </button>
            <button type="button" className="chip-btn" onClick={() => askInChat('¿Cuál es el estatus de mis solicitudes?')}>
              Consultar estatus en chat
            </button>
          </div>
        </div>

        {formMsg && (
          <div
            role="status"
            style={{
              marginBottom: '0.75rem',
              padding: '0.6rem 0.85rem',
              borderRadius: 8,
              background: formMsg.type === 'ok' ? 'var(--success-soft)' : 'var(--danger-soft)',
              color: formMsg.type === 'ok' ? 'var(--success)' : 'var(--danger)',
              fontSize: '0.86rem',
            }}
          >
            {formMsg.text}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleCreateRequest} style={{ background: 'var(--bg-page)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border)', marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label htmlFor="req-type" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>Tipo</label>
              <select id="req-type" className="input" value={reqType} onChange={(e) => setReqType(e.target.value as typeof reqType)}>
                <option value="vacaciones">Vacaciones (RH-01: 10 días hábiles antes)</option>
                <option value="permiso_con_goce">Permiso con goce</option>
                <option value="permiso_sin_goce">Permiso sin goce</option>
                <option value="home_office">Home office</option>
              </select>
            </div>
            <div>
              <label htmlFor="req-start" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>Fecha inicio</label>
              <input id="req-start" type="date" required className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="req-end" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>Fecha fin</label>
              <input id="req-end" type="date" required className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="req-reason" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>Motivo (opcional)</label>
              <input id="req-reason" type="text" className="input" placeholder="Ej. Descanso anual" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%' }}>
                {submitting ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </div>
          </form>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Periodo</th>
                <th>Días</th>
                <th>Estado</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent_requests || []).length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No tienes solicitudes registradas.
                  </td>
                </tr>
              ) : (
                data!.recent_requests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.request_type.replace('_', ' ')}</td>
                    <td>{r.start_date} al {r.end_date}</td>
                    <td>{r.days_count}</td>
                    <td><span className="badge badge-accent">{r.status.toUpperCase()}</span></td>
                    <td>{r.reason || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
