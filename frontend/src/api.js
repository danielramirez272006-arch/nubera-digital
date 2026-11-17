const API_BASE = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getStoredToken() {
  return localStorage.getItem('nubera_token');
}

export function setStoredToken(token) {
  localStorage.setItem('nubera_token', token);
}

export function clearStoredToken() {
  localStorage.removeItem('nubera_token');
}

export async function apiRequest(path, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.', 0);
  }

  if (!res.ok) {
    let message = 'Ocurrió un error al comunicarse con el servidor.';
    try {
      const err = await res.json();
      if (err.detail) message = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
    } catch {
      // ignore json parse error
    }
    if (res.status === 401 && path !== '/api/auth/login') {
      clearStoredToken();
    }
    throw new ApiError(message, res.status);
  }

  return res.json();
}
