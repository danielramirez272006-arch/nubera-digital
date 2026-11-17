import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Send,
  ExternalLink,
  FileText,
  AlertCircle,
  Sparkles,
  Plus,
  ThumbsUp,
  ThumbsDown,
  Ticket,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { apiRequest } from '../api';
import { validateChatMessage, normalizeArray } from '../utils/validators';
import DocumentViewerModal from '../components/DocumentViewerModal';
import MarkdownText from '../components/MarkdownText';

const QUICK_QUESTIONS = [
  { label: 'Vacaciones: anticipación', q: '¿Con cuánta anticipación pido vacaciones?' },
  { label: 'Mi saldo de vacaciones', q: '¿Cuántos días me quedan?' },
  { label: 'Saldo y uso próximo año', q: '¿Cuántos días me quedan y puedo usarlos el próximo año?' },
  { label: 'Permisos con goce', q: '¿Cuántos días de permiso dan por paternidad o matrimonio?' },
  { label: 'Incapacidades IMSS', q: '¿Cómo se pagan los primeros días de incapacidad por enfermedad?' },
  { label: 'Pagos y aguinaldo', q: '¿Qué días se paga la nómina semanal y cuándo se programa el aguinaldo?' },
];

export default function ConsultasPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('conv-principal');
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [loadingInit, setLoadingInit] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [ticketDraft, setTicketDraft] = useState(null);
  const [createdTicket, setCreatedTicket] = useState(null);
  const [viewingDocId, setViewingDocId] = useState(null);
  const [expandedSnippets, setExpandedSnippets] = useState({});
  const endRef = useRef(null);

  async function loadHistory(sessionId) {
    setLoadingInit(true);
    setError('');
    try {
      const [convs, hist] = await Promise.all([
        apiRequest('/api/chat/conversations'),
        apiRequest(`/api/chat/history?session_id=${encodeURIComponent(sessionId)}`),
      ]);
      setConversations(normalizeArray(convs));
      setMessages(normalizeArray(hist).map(validateChatMessage));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.');
    } finally {
      setLoadingInit(false);
    }
  }

  useEffect(() => {
    loadHistory(activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    const prefill = searchParams.get('q');
    if (prefill) {
      setQuestion(prefill);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  function startNewConversation() {
    const newId = `conv-${Date.now()}`;
    setActiveSessionId(newId);
    setMessages([]);
    setTicketDraft(null);
    setCreatedTicket(null);
  }

  async function sendQuestion(textToSend) {
    const trimmed = (textToSend ?? question).trim();
    if (!trimmed || sending) return;

    setError('');
    setSending(true);
    setCreatedTicket(null);
    if (!textToSend) setQuestion('');

    try {
      const raw = await apiRequest('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ question: trimmed, session_id: activeSessionId }),
      });
      const res = validateChatMessage(raw);
      setMessages((prev) => [...prev, res]);
      const convs = await apiRequest('/api/chat/conversations');
      setConversations(normalizeArray(convs));
    } catch (err) {
      if (!textToSend) setQuestion(trimmed);
      setError(err instanceof Error ? err.message : 'Ocurrió un error al procesar tu consulta.');
    } finally {
      setSending(false);
    }
  }

  async function sendFeedback(logId, helpful) {
    try {
      await apiRequest(`/api/chat/${logId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ helpful }),
      });
      setMessages((prev) => prev.map((m) => (m.id === logId ? { ...m, helpful } : m)));
    } catch {
      // ignore feedback error
    }
  }

  async function confirmTicketCreation() {
    if (!ticketDraft) return;
    try {
      const t = await apiRequest('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          topic: ticketDraft.topic,
          confirmed_summary: ticketDraft.summary,
          is_sensitive: false,
        }),
      });
      setCreatedTicket(t);
      setTicketDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el ticket.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem' }}>Consultas del colaborador</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            Asistente conectado a políticas vigentes en Drive y tus registros personales.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="conv-select" style={{ fontSize: '0.84rem', fontWeight: 600 }}>Conversación:</label>
          <select
            id="conv-select"
            className="input"
            style={{ width: 'auto', minWidth: 190 }}
            value={activeSessionId}
            onChange={(e) => setActiveSessionId(e.target.value)}
          >
            <option value="conv-principal">Conversación principal</option>
            {conversations
              .filter((c) => c.id !== 'conv-principal')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={startNewConversation}>
            <Plus size={16} aria-hidden="true" />
            <span>Nueva conversación</span>
          </button>
        </div>
      </div>

      <section className="card chat-layout" aria-label="Asistente de consultas de RRHH">
        <div>
          <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Preguntas rápidas
          </div>
          <div className="quick-chips">
            {QUICK_QUESTIONS.map((item) => (
              <button
                key={item.label}
                type="button"
                className="chip-btn"
                onClick={() => sendQuestion(item.q)}
                disabled={sending}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="chat-messages" aria-live="polite">
          {loadingInit ? (
            <div style={{ margin: 'auto', color: 'var(--text-secondary)' }}>Cargando historial de consultas...</div>
          ) : messages.length === 0 ? (
            <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 420, color: 'var(--text-secondary)' }}>
              <Sparkles size={28} color="#0f766e" style={{ marginBottom: 8 }} aria-hidden="true" />
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                Inicia una nueva consulta
              </div>
              <div style={{ fontSize: '0.88rem' }}>
                Pregunta sobre vacaciones, permisos, incapacidades, pagos o tu información personal.
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <React.Fragment key={msg.id}>
                <div className="msg-bubble msg-user">{msg.question}</div>
                <div className="msg-bubble msg-bot">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    <span className="badge badge-accent">{msg.agent_used}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Traza: {msg.trace_id} · {msg.latency_ms} ms
                    </span>
                  </div>

                  <MarkdownText content={msg.answer} />

                  {msg.needs_hr_escalation && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}
                        onClick={() =>
                          setTicketDraft({
                            topic: msg.topic || 'Consulta general',
                            summary:
                              msg.suggested_ticket_summary ||
                              `Consulta original: ${msg.question}\nMotivo: Sin respaldo suficiente en políticas.`,
                          })
                        }
                      >
                        <Ticket size={14} aria-hidden="true" />
                        <span>Crear ticket para RRHH</span>
                      </button>
                    </div>
                  )}

                  {msg.citations && msg.citations.length > 0 && (() => {
                    const grouped = msg.citations.reduce((acc, cit) => {
                      const key = cit.drive_file_id || cit.title;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(cit);
                      return acc;
                    }, {});
                    return (
                      <div className="citations-box" aria-label="Fuentes documentales">
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          Respaldo documental en Google Drive:
                        </div>
                        {Object.entries(grouped).map(([docKey, group]) => {
                          const primary = group[0];
                          const snipKey = `${msg.id}-${docKey}`;
                          const isExpanded = !!expandedSnippets[snipKey];
                          const sectionsLabel = group.map((g) => g.section).join(' · ');
                          return (
                            <div key={snipKey} className="citation-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                                <div>
                                  <FileText size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} aria-hidden="true" />
                                  <strong>{primary.title}</strong> · <span style={{ color: 'var(--text-secondary)' }}>{sectionsLabel}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                  {primary.snippet && (
                                    <button
                                      type="button"
                                      className="chip-btn"
                                      aria-expanded={isExpanded}
                                      style={{ padding: '0.2rem 0.55rem', fontSize: '0.76rem', fontWeight: 600 }}
                                      onClick={() =>
                                        setExpandedSnippets((prev) => ({ ...prev, [snipKey]: !prev[snipKey] }))
                                      }
                                    >
                                      {isExpanded ? 'Ocultar fragmento' : 'Ver fragmento'}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="chip-btn"
                                    style={{ padding: '0.2rem 0.55rem', fontSize: '0.76rem', fontWeight: 600 }}
                                    onClick={() => setViewingDocId(primary.drive_file_id)}
                                  >
                                    Ver documento
                                  </button>
                                  <a
                                    href={primary.drive_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                  >
                                    <span>Abrir en Drive</span>
                                    <ExternalLink size={12} aria-hidden="true" />
                                  </a>
                                </div>
                              </div>
                              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                                Versión: {primary.version} · Vigencia: {primary.effective_date} · Responsable: {primary.owner}
                              </div>
                              {isExpanded && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.25rem' }}>
                                  {group.map((g, gIdx) => (
                                    <blockquote
                                      key={`${snipKey}-g-${gIdx}`}
                                      style={{ margin: 0, paddingLeft: '0.6rem', borderLeft: '2px solid var(--accent)', fontSize: '0.78rem', color: 'var(--text-primary)' }}
                                    >
                                      <strong>{g.section}:</strong> “{g.snippet}”
                                    </blockquote>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.6rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <span>¿Esta respuesta fue útil?</span>
                    <button
                      type="button"
                      className="chip-btn"
                      aria-label="Respuesta útil"
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderColor: msg.helpful === true ? 'var(--accent)' : undefined,
                        background: msg.helpful === true ? 'var(--accent-soft)' : undefined,
                      }}
                      onClick={() => sendFeedback(msg.id, true)}
                    >
                      <ThumbsUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="chip-btn"
                      aria-label="Respuesta no útil"
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderColor: msg.helpful === false ? 'var(--danger)' : undefined,
                        background: msg.helpful === false ? 'var(--danger-soft)' : undefined,
                      }}
                      onClick={() => sendFeedback(msg.id, false)}
                    >
                      <ThumbsDown size={13} />
                    </button>
                  </div>
                </div>
              </React.Fragment>
            ))
          )}
          {sending && (
            <div className="msg-bubble msg-bot" style={{ color: 'var(--text-secondary)' }}>
              Orquestando agentes y validando respuesta...
            </div>
          )}
          <div ref={endRef} />
        </div>

        {ticketDraft && (
          <div className="card" style={{ background: '#fffbeb', borderColor: '#f59e0b' }} role="region" aria-label="Confirmación de ticket">
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Confirma el resumen para crear tu ticket de RRHH</h2>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Este resumen se compartirá con el equipo de RRHH:
            </p>
            <textarea
              className="input"
              rows={4}
              value={ticketDraft.summary}
              onChange={(e) => setTicketDraft({ ...ticketDraft, summary: e.target.value })}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-primary" onClick={confirmTicketCreation}>
                Confirmar y crear ticket
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setTicketDraft(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {createdTicket && (
          <div className="card" style={{ background: 'var(--success-soft)', borderColor: 'var(--success)' }} role="status">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--success)' }}>
              <CheckCircle2 size={18} />
              <span>Ticket creado con folio {createdTicket.folio}</span>
            </div>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.86rem' }}>
              Asignado a {createdTicket.assigned_to}. Puedes seguir su historial en{' '}
              <Link to="/mis-tickets" style={{ fontWeight: 600 }}>Mis tickets</Link>.
            </p>
          </div>
        )}

        {error && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', background: 'var(--danger-soft)', color: 'var(--danger)', padding: '0.6rem 0.85rem', borderRadius: 8, fontSize: '0.86rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
            <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }} onClick={() => loadHistory(activeSessionId)}>
              <RefreshCw size={13} /> Reintentar
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion();
          }}
          style={{ display: 'flex', gap: '0.6rem' }}
        >
          <label htmlFor="chat-input" style={{ position: 'absolute', left: -9999 }}>
            Escribe tu consulta de RRHH
          </label>
          <input
            id="chat-input"
            type="text"
            className="input"
            placeholder="Ej. ¿Con cuánta anticipación pido vacaciones? o ¿Cuántos días me quedan?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={sending}
          />
          <button type="submit" className="btn btn-primary" disabled={sending || !question.trim()}>
            <Send size={16} aria-hidden="true" />
            <span>Enviar</span>
          </button>
        </form>
      </section>

      <DocumentViewerModal driveFileId={viewingDocId} onClose={() => setViewingDocId(null)} />
    </div>
  );
}
