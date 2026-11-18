import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest, clearStoredToken, getStoredToken, setStoredToken } from './api';
import { validateLoginResponse } from './utils/validators';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState(null);

  useEffect(() => {
    const token = getStoredToken();
    Promise.all([
      apiRequest('/api/system/status').catch(() => null),
      token ? apiRequest('/api/auth/me').catch(() => null) : Promise.resolve(null),
    ]).then(([sys, me]) => {
      setSystemStatus(sys);
      if (me) {
        setUser(me);
      }
      // Nota: apiRequest ya limpia el token cuando el backend responde 401;
      // no lo borramos ante errores transitorios de red.
      setLoading(false);
    });
  }, []);

  async function login(email, password) {
    const raw = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const data = validateLoginResponse(raw);
    setStoredToken(data.access_token);
    setUser(data.user);
    return data;
  }

  function logout() {
    if (getStoredToken()) {
      apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
    clearStoredToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, systemStatus, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
