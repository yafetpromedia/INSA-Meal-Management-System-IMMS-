const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

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

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { accessToken } = getTokens();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message ?? 'Request failed');
  }
  return data as T;
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
  }
  return data;
}

export function getActiveOrganizationId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('imms_org');
}
