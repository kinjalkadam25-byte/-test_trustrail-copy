const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/**
 * Shared fetch wrapper. Token is passed explicitly (from AuthContext) rather
 * than read from storage, since the JWT lives only in React state — no
 * localStorage/sessionStorage anywhere in this app (see AuthContext.tsx).
 */
export async function apiFetch<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    throw new ApiError('Could not reach the TrustTrail backend. Is it running?', 0);
  }

  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(body?.error || `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string, token?: string | null) => apiFetch<T>(path, token, { method: 'GET' }),
  post: <T>(path: string, body: unknown, token?: string | null) =>
    apiFetch<T>(path, token, { method: 'POST', body: JSON.stringify(body) }),
};
