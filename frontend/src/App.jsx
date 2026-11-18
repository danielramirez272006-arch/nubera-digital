import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import PortalLayout from './components/PortalLayout';
import LoginPage from './pages/LoginPage';

const ConsultasPage = lazy(() => import('./pages/ConsultasPage'));
const MisDatosPage = lazy(() => import('./pages/MisDatosPage'));
const MisTicketsPage = lazy(() => import('./pages/MisTicketsPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ReportesPage = lazy(() => import('./pages/ReportesPage'));
const SolicitudesPage = lazy(() => import('./pages/SolicitudesPage'));
const TicketsPage = lazy(() => import('./pages/TicketsPage'));
const DocumentosPage = lazy(() => import('./pages/DocumentosPage'));

function PageLoader() {
  return (
    <div style={{ padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
      Cargando módulo...
    </div>
  );
}

function ProtectedRoute({ children, requiredRole = null }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)' }}>
        Cargando sesión de Nubera Digital...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={user.role === 'rrhh' ? '/dashboard' : '/consultas'} replace />;
  }
  return (
    <PortalLayout>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </PortalLayout>
  );
}

function DefaultRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'rrhh' ? '/dashboard' : '/consultas'} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/consultas" element={<ProtectedRoute><ConsultasPage /></ProtectedRoute>} />
            <Route path="/mis-datos" element={<ProtectedRoute><MisDatosPage /></ProtectedRoute>} />
            <Route path="/mis-tickets" element={<ProtectedRoute><MisTicketsPage /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute requiredRole="rrhh"><DashboardPage /></ProtectedRoute>} />
            <Route path="/reportes" element={<ProtectedRoute requiredRole="rrhh"><ReportesPage /></ProtectedRoute>} />
            <Route path="/solicitudes" element={<ProtectedRoute requiredRole="rrhh"><SolicitudesPage /></ProtectedRoute>} />
            <Route path="/tickets" element={<ProtectedRoute requiredRole="rrhh"><TicketsPage /></ProtectedRoute>} />
            <Route path="/documentos" element={<ProtectedRoute requiredRole="rrhh"><DocumentosPage /></ProtectedRoute>} />
            <Route path="*" element={<DefaultRedirect />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
