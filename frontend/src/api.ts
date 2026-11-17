const API_BASE = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('nubera_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = 'Ocurrió un error al comunicarse con el servidor.';
    try {
      const err = await res.json();
      if (err.detail) message = err.detail;
    } catch {
      // ignore json parse error
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}
