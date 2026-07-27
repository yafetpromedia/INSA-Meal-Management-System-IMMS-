const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    email?: string | null;
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
  const accessToken =
    localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
  const refreshToken =
    localStorage.getItem('imms_refresh') || sessionStorage.getItem('imms_refresh');
  return { accessToken, refreshToken };
}

export function setTokens(accessToken: string, refreshToken: string, remember = true) {
  if (!accessToken || !refreshToken || accessToken === 'undefined' || refreshToken === 'undefined') {
    throw new Error('Invalid session tokens');
  }
  clearTokens();
  const store = remember ? localStorage : sessionStorage;
  store.setItem('imms_access', accessToken);
  store.setItem('imms_refresh', refreshToken);
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  for (const store of [localStorage, sessionStorage]) {
    store.removeItem('imms_access');
    store.removeItem('imms_refresh');
    store.removeItem('imms_user');
    store.removeItem('imms_org');
    store.removeItem('imms_remember');
  }
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
      if (!res.ok) return false;
      const payload = await res.json();
      const data = unwrap<LoginResponse>(payload);
      if (!data?.accessToken || !data?.refreshToken) return false;
      const remember = !sessionStorage.getItem('imms_access');
      setTokens(data.accessToken, data.refreshToken, remember);
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

export async function login(
  usernameOrEmail: string,
  password: string,
  opts: { remember?: boolean } = {},
) {
  const value = usernameOrEmail.trim();
  const body = value.includes('@')
    ? { email: value.toLowerCase(), password }
    : { username: value.toLowerCase(), password };

  const data = await api<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!data?.accessToken || !data?.refreshToken || !data?.user) {
    throw new Error('Login succeeded but session data was incomplete. Please try again.');
  }

  const remember = opts.remember !== false;
  setTokens(data.accessToken, data.refreshToken, remember);
  const store = remember ? localStorage : sessionStorage;
  store.setItem('imms_user', JSON.stringify(data.user));
  const orgId = data.user.defaultOrganizationId ?? data.user.organizationIds?.[0] ?? null;
  if (orgId) {
    // Always keep org in localStorage for convenience across tabs when remembered;
    // for session-only login, keep it in sessionStorage.
    store.setItem('imms_org', orgId);
  }
  return data;
}

export function getActiveOrganizationId(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('imms_org') || sessionStorage.getItem('imms_org');
  if (stored) {
    try {
      const userRaw = localStorage.getItem('imms_user') || sessionStorage.getItem('imms_user');
      const user = userRaw ? (JSON.parse(userRaw) as LoginResponse['user']) : null;
      if (user?.organizationIds?.length && !user.organizationIds.includes(stored)) {
        // Client-trusted org must belong to the signed-in user
        const fallback = user.defaultOrganizationId ?? user.organizationIds[0] ?? null;
        return fallback;
      }
    } catch {
      /* ignore */
    }
    return stored;
  }
  try {
    const userRaw = localStorage.getItem('imms_user') || sessionStorage.getItem('imms_user');
    const user = userRaw ? (JSON.parse(userRaw) as LoginResponse['user']) : null;
    return user?.defaultOrganizationId ?? user?.organizationIds?.[0] ?? null;
  } catch {
    return null;
  }
}
