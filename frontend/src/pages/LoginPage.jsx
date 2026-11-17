import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../AuthContext';

export default function LoginPage() {
  const { login, systemStatus } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Ingresa tu correo corporativo y contraseña.');
      return;
    }
    setSubmitting(true);
    try {
      const data = await login(email, password);
      navigate(data.redirect_to || '/consultas', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(demoEmail, demoPass) {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError('');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '1.5rem',
        background: 'linear-gradient(160deg, #f4f7fa 0%, #e6f4f1 100%)',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 440, padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.5rem' }}>
          <div className="brand-mark" style={{ width: 44, height: 44, fontSize: '1.2rem' }} aria-hidden="true">
            ND
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', color: 'var(--text-primary)' }}>Nubera Digital</h1>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Portal de Recursos Humanos
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="email" style={{ display: 'block', fontSize: '0.86rem', fontWeight: 600, marginBottom: 6 }}>
              Correo corporativo
            </label>
            <div style={{ position: 'relative' }}>
              <Mail
                size={16}
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}
                aria-hidden="true"
              />
              <input
                id="email"
                type="email"
                required
                className="input"
                style={{ paddingLeft: '2.2rem' }}
                placeholder="nombre.apellido@nubera.mx"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" style={{ display: 'block', fontSize: '0.86rem', fontWeight: 600, marginBottom: 6 }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <Lock
                size={16}
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}
                aria-hidden="true"
              />
              <input
                id="password"
                type="password"
                required
                className="input"
                style={{ paddingLeft: '2.2rem' }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: 'var(--danger-soft)',
                color: 'var(--danger)',
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                fontSize: '0.86rem',
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            <LogIn size={17} aria-hidden="true" />
            <span>{submitting ? 'Verificando sesión...' : 'Iniciar sesión'}</span>
          </button>
        </form>

        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1.15rem',
            borderTop: '1px solid var(--border)',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.6rem' }}>
            <ShieldCheck size={15} color="#0f766e" aria-hidden="true" />
            <span>Cuentas de demostración</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.45rem 0.7rem' }}
              onClick={() => fillDemo('ana.garcia@nubera.mx', 'Colaborador123!')}
            >
              <span>Colaborador: ana.garcia@nubera.mx</span>
              <span className="badge badge-accent">Usar</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.45rem 0.7rem' }}
              onClick={() => fillDemo('laura.mendoza@nubera.mx', 'Rrhh123!')}
            >
              <span>RRHH: laura.mendoza@nubera.mx</span>
              <span className="badge badge-accent">Usar</span>
            </button>
          </div>
          {systemStatus && (
            <p style={{ marginTop: '0.75rem', marginBottom: 0, fontSize: '0.78rem' }}>
              Integraciones activas: {systemStatus.database_mode} · {systemStatus.drive_mode}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
