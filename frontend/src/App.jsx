import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import PortalLayout from './components/PortalLayout';
import LoginPage from './pages/LoginPage';
import ConsultasPage from './pages/ConsultasPage';
import MisDatosPage from './pages/MisDatosPage';
import MisTicketsPage from './pages/MisTicketsPage';
import DashboardPage from './pages/DashboardPage';
import ReportesPage from './pages/ReportesPage';
import SolicitudesPage from './pages/SolicitudesPage';
import TicketsPage from './pages/TicketsPage';
import DocumentosPage from './pages/DocumentosPage';

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
  return <PortalLayout>{children}</PortalLayout>;
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
