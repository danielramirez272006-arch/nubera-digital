import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  UserCheck,
  Ticket,
  BarChart3,
  FileSpreadsheet,
  ClipboardList,
  FolderSync,
  LogOut,
  Menu,
  X,
  Info,
} from 'lucide-react';
import { useAuth } from '../AuthContext';

export default function PortalLayout({ children }) {
  const { user, logout, systemStatus } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navContent = (onItemClick) => (
    <>
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">ND</div>
        <div>
          <div className="brand-title">Nubera Digital</div>
          <div className="brand-sub">Portal Interno de RRHH</div>
        </div>
      </div>

      <nav className="nav-links" aria-label="Navegación principal">
        {user?.role === 'colaborador' ? (
          <>
            <NavLink to="/consultas" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onItemClick}>
              <MessageSquare size={18} aria-hidden="true" />
              <span>Consultas</span>
            </NavLink>
            <NavLink to="/mis-datos" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onItemClick}>
              <UserCheck size={18} aria-hidden="true" />
              <span>Mis datos</span>
            </NavLink>
            <NavLink to="/mis-tickets" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onItemClick}>
              <Ticket size={18} aria-hidden="true" />
              <span>Mis tickets</span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onItemClick}>
              <BarChart3 size={18} aria-hidden="true" />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/reportes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onItemClick}>
              <FileSpreadsheet size={18} aria-hidden="true" />
              <span>Reportes</span>
            </NavLink>
            <NavLink to="/solicitudes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onItemClick}>
              <ClipboardList size={18} aria-hidden="true" />
              <span>Solicitudes</span>
            </NavLink>
            <NavLink to="/tickets" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onItemClick}>
              <Ticket size={18} aria-hidden="true" />
              <span>Tickets</span>
            </NavLink>
            <NavLink to="/documentos" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onItemClick}>
              <FolderSync size={18} aria-hidden="true" />
              <span>Documentos</span>
            </NavLink>
            <NavLink to="/consultas" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onItemClick}>
              <MessageSquare size={18} aria-hidden="true" />
              <span>Consultas</span>
            </NavLink>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-pill">
          <div className="user-pill-name">{user?.full_name}</div>
          <div className="user-pill-role">
            {user?.role === 'rrhh' ? 'Personal de RRHH' : 'Colaborador'} · {user?.department}
          </div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={handleLogout}>
          <LogOut size={16} aria-hidden="true" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">{navContent(undefined)}</aside>

      <div className="main-area">
        <header className="mobile-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div className="brand-mark" style={{ width: 32, height: 32, fontSize: '0.95rem' }} aria-hidden="true">
              ND
            </div>
            <strong>Nubera Digital · RRHH</strong>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            aria-label="Abrir menú de navegación"
            onClick={() => setMobileOpen(true)}
            style={{ padding: '0.45rem 0.65rem' }}
          >
            <Menu size={20} />
          </button>
        </header>

        {mobileOpen && (
          <div className="mobile-drawer-backdrop" role="dialog" aria-modal="true" aria-label="Menú móvil">
            <div className="mobile-drawer">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  aria-label="Cerrar menú"
                  onClick={() => setMobileOpen(false)}
                  style={{ padding: '0.35rem 0.55rem' }}
                >
                  <X size={18} />
                </button>
              </div>
              {navContent(() => setMobileOpen(false))}
            </div>
          </div>
        )}

        <main className="content-wrap">
          {systemStatus && (
            <div className="demo-banner" role="status">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Info size={16} color="#0f766e" aria-hidden="true" />
                <span>
                  <strong>Entorno activo:</strong> {systemStatus.database_mode} · {systemStatus.drive_mode} · {systemStatus.active_policies_count} políticas
                </span>
              </div>
              {systemStatus.demo_mode && (
                <span className="badge badge-accent">Datos de demostración activos</span>
              )}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
