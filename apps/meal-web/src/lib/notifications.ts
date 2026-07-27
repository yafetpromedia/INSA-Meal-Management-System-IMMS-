/** Local + activity notification helpers for the topbar bell. */

export type LocalNotification = {
  id: string;
  title: string;
  message?: string;
  kind: 'success' | 'warning' | 'error' | 'info';
  at: string;
  href?: string;
};

const INBOX_KEY = 'imms_notifications';
const SEEN_KEY = 'imms_notif_seen_at';
export const NOTIF_EVENT = 'imms:notifications';

export function readLocalNotifications(): LocalNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(INBOX_KEY);
    const list = raw ? (JSON.parse(raw) as LocalNotification[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function pushLocalNotification(
  input: Omit<LocalNotification, 'id' | 'at'> & { id?: string; at?: string },
) {
  if (typeof window === 'undefined') return;
  const href = sanitizeHref(input.href);
  const item: LocalNotification = {
    id: input.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: input.title,
    message: input.message,
    kind: input.kind,
    at: input.at ?? new Date().toISOString(),
    href,
  };
  const next = [item, ...readLocalNotifications().filter((n) => n.id !== item.id)].slice(0, 40);
  localStorage.setItem(INBOX_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(NOTIF_EVENT));
}

/** Only allow same-origin relative paths (block //evil.com and https://...). */
export function sanitizeHref(href?: string): string | undefined {
  if (!href) return undefined;
  const t = href.trim();
  if (!t.startsWith('/') || t.startsWith('//') || t.includes('\\')) return undefined;
  return t;
}

export function readSeenAt(): string {
  if (typeof window === 'undefined') return new Date(0).toISOString();
  return localStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString();
}

export function writeSeenAt(iso: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SEEN_KEY, iso);
}
