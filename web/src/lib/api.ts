import { env } from './env';

export type ApiError = {
  status: number;
  message: string;
};

function getCookieValue(name: string): string {
  if (typeof document === 'undefined') return '';
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return part.slice(idx + 1).trim();
  }
  return '';
}

async function parseJsonSafe<T>(res: Response): Promise<T | null> {
  const txt = await res.text();
  if (!txt) return null;
  try {
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!env.apiBaseUrl.trim()) {
    throw {
      status: 0,
      message:
        'URL do backend não configurada. Ajuste HOST/URL_BACKEND no docker-compose.yml e faça rebuild do web.',
    } satisfies ApiError;
  }
  const url = `${env.apiBaseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  const token = getCookieValue('orx_token');
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok && res.status === 401 && path !== '/admin/login') {
    if (typeof document !== 'undefined') {
      document.cookie = 'orx_token=; Path=/; Max-Age=0; SameSite=Lax; Priority=High';
    }
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
    }
  }

  if (!res.ok) {
    const json = await parseJsonSafe<unknown>(res);
    const obj =
      json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
    const messageValue = obj?.message;
    const errorValue = obj?.error;
    const msg =
      (typeof messageValue === 'string' && messageValue.trim()
        ? messageValue
        : '') ||
      (Array.isArray(messageValue) ? String(messageValue[0] ?? '') : '') ||
      (typeof errorValue === 'string' && errorValue.trim() ? errorValue : '');
    const message = msg || `${res.status} ${res.statusText}`;
    throw { status: res.status, message } satisfies ApiError;
  }

  const data = await parseJsonSafe<T>(res);
  return (data ?? (null as unknown as T));
}
