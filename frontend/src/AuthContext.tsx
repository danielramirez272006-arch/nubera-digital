import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest } from './api';
import { SystemStatus, UserSession } from './types';

interface LoginResponse {
  access_token: string;
  token_type: string;
  redirect_to: string;
  user: UserSession;
}

interface AuthContextValue {
  user: UserSession | null;
  loading: boolean;
  systemStatus: SystemStatus | null;
  login: (email: string, password: string) => Promise<LoginResponse>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('nubera_token');
    Promise.all([
      apiRequest<SystemStatus>('/api/system/status').catch(() => null),
      token ? apiRequest<UserSession>('/api/auth/me').catch(() => null) : Promise.resolve(null),
    ]).then(([sys, me]) => {
      setSystemStatus(sys);
      if (me) {
        setUser(me);
      } else {
        localStorage.removeItem('nubera_token');
      }
      setLoading(false);
    });
  }, []);

  async function login(email: string, password: string): Promise<LoginResponse> {
    const data = await apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('nubera_token', data.access_token);
    setUser(data.user);
    return data;
  }

  function logout() {
    localStorage.removeItem('nubera_token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, systemStatus, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
