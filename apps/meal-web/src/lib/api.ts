const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    roles: string[];
    organizationIds: string[];
    defaultOrganizationId: string | null;
    campusIds: string[];
    programIds: string[];
  };
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  meta?: Record<string, unknown>;
};

function getTokens() {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null };
  return {
    accessToken: localStorage.getItem('imms_access'),
    refreshToken: localStorage.getItem('imms_refresh'),
  };
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('imms_access', accessToken);
  localStorage.setItem('imms_refresh', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('imms_access');
  localStorage.removeItem('imms_refresh');
  localStorage.removeItem('imms_user');
  localStorage.removeItem('imms_org');
}

function unwrap<T>(payload: T | ApiEnvelope<T>): T {
  if (
    payload &&
    typeof payload === 'object' &&
    'success' in (payload as object) &&
    'data' in (payload as object)
  ) {
    return (payload as ApiEnvelope<T>).data as T;
  }
  return payload as T;
}

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  clearTokens();
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { refreshToken } = getTokens();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return false;
      const data = unwrap<{ accessToken: string; refreshToken: string }>(payload);
      if (!data?.accessToken || !data?.refreshToken) return false;
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function api<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const { accessToken } = getTokens();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const payload = await res.json().catch(() => ({}));

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    const ok = await refreshAccessToken();
    if (ok) return api<T>(path, options, true);
    redirectToLogin();
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    throw new Error(
      (payload as { message?: string }).message ??
        (res.status === 401 ? 'Session expired. Please log in again.' : 'Request failed'),
    );
  }
  return unwrap<T>(payload);
}

export async function login(email: string, password: string) {
  const data = await api<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setTokens(data.accessToken, data.refreshToken);
  localStorage.setItem('imms_user', JSON.stringify(data.user));
  if (data.user.defaultOrganizationId) {
    localStorage.setItem('imms_org', data.user.defaultOrganizationId);
  } else if (data.user.organizationIds?.[0]) {
    localStorage.setItem('imms_org', data.user.organizationIds[0]);
  }
  return data;
}

export function getActiveOrganizationId(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('imms_org');
  if (stored) return stored;
  try {
    const user = JSON.parse(localStorage.getItem('imms_user') ?? 'null') as LoginResponse['user'] | null;
    const fallback = user?.defaultOrganizationId ?? user?.organizationIds?.[0] ?? null;
    if (fallback) localStorage.setItem('imms_org', fallback);
    return fallback;
  } catch {
    return null;
  }
}
