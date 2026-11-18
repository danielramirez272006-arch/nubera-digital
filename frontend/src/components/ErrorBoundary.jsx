import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            background: 'var(--bg-main, #0f172a)',
            color: 'var(--text-primary, #f8fafc)',
          }}
        >
          <div style={{ maxWidth: 440, textAlign: 'center' }}>
            <h2 style={{ marginBottom: 8 }}>Ocurrió un error inesperado</h2>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', marginBottom: 20 }}>
              La interfaz encontró un problema al renderizar esta vista. Puedes recargar para continuar.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent, #2563eb)',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
