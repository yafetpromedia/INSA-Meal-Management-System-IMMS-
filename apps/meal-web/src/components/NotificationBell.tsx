'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { api, getActiveOrganizationId } from '@/lib/api';
import { formatEthiopiaTime } from '@/lib/timezone';
import {
  NOTIF_EVENT,
  readLocalNotifications,
  readSeenAt,
  sanitizeHref,
  writeSeenAt,
  type LocalNotification,
} from '@/lib/notifications';

type ActivityItem = {
  id?: string;
  action?: string;
  resource?: string;
  resourceId?: string | null;
  timestamp?: string;
  user?: { fullName?: string };
};

type InboxItem = {
  id: string;
  title: string;
  message?: string;
  kind: 'success' | 'warning' | 'error' | 'info';
  at: string;
  href?: string;
};

function activityTitle(action?: string) {
  switch (action) {
    case 'Meal.Serve':
      return 'Meal served';
    case 'Meal.Override':
      return 'Meal override';
    case 'Meal.DuplicatePrevented':
      return 'Duplicate scan blocked';
    case 'Meal.SessionUpsert':
    case 'Meal.SessionUpdate':
      return 'Meal session updated';
    default:
      return action?.replace(/\./g, ' · ') ?? 'Update';
  }
}

function activityKind(action?: string): InboxItem['kind'] {
  switch (action) {
    case 'Meal.Serve':
      return 'success';
    case 'Meal.Override':
      return 'info';
    case 'Meal.DuplicatePrevented':
      return 'warning';
    default:
      return 'info';
  }
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    const day = d.toLocaleDateString('en-GB', {
      timeZone: 'Africa/Addis_Ababa',
      day: 'numeric',
      month: 'short',
    });
    return `${day} · ${formatEthiopiaTime(d)}`;
  } catch {
    return iso;
  }
}

function fromLocal(n: LocalNotification): InboxItem {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    kind: n.kind,
    at: n.at,
    href: sanitizeHref(n.href),
  };
}

function fromActivity(a: ActivityItem): InboxItem {
  const who = a.user?.fullName ? `by ${a.user.fullName}` : undefined;
  const href = a.action?.startsWith('Meal.') ? '/meals' : '/dashboard';
  return {
    id: a.id ?? `act-${a.timestamp}-${a.action}`,
    title: activityTitle(a.action),
    message: who,
    kind: activityKind(a.action),
    at: a.timestamp ?? new Date().toISOString(),
    href,
  };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [seenAt, setSeenAt] = useState<string>(() =>
    typeof window !== 'undefined' ? readSeenAt() : new Date(0).toISOString(),
  );
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const merge = useCallback((activity: ActivityItem[], local: LocalNotification[]) => {
    const map = new Map<string, InboxItem>();
    for (const a of activity) {
      const item = fromActivity(a);
      map.set(item.id, item);
    }
    for (const n of local) {
      map.set(n.id, fromLocal(n));
    }
    return [...map.values()].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 30);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const local = readLocalNotifications();
    try {
      const orgId = getActiveOrganizationId();
      const q = orgId ? `?organizationId=${orgId}` : '';
      const activity = await api<ActivityItem[]>(`/dashboard/activity${q}`);
      setItems(merge(Array.isArray(activity) ? activity : [], local));
    } catch {
      setItems(merge([], local));
    } finally {
      setLoading(false);
    }
  }, [merge]);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), 30000);
    const onLocal = () => void refresh();
    window.addEventListener(NOTIF_EVENT, onLocal);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener(NOTIF_EVENT, onLocal);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = useMemo(() => {
    const seen = +new Date(seenAt);
    return items.filter((i) => +new Date(i.at) > seen).length;
  }, [items, seenAt]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      void refresh();
      const now = new Date().toISOString();
      writeSeenAt(now);
      setSeenAt(now);
    }
  }

  return (
    <div className="notif" ref={rootRef}>
      <button
        type="button"
        className={`icon-btn ${open ? 'is-active' : ''}`}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        title="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <Bell aria-hidden />
        {unread > 0 ? <span className="notif-badge">{unread > 9 ? '9+' : unread}</span> : null}
      </button>

      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <strong>Notifications</strong>
            <Link href="/dashboard" className="notif-link" onClick={() => setOpen(false)}>
              Dashboard
            </Link>
          </div>
          {loading && items.length === 0 ? (
            <p className="muted notif-empty">Loading…</p>
          ) : items.length === 0 ? (
            <p className="muted notif-empty">No meal alerts yet.</p>
          ) : (
            <ul className="notif-list">
              {items.map((item) => (
                <li key={item.id} className={`notif-item notif-${item.kind}`}>
                  {item.href ? (
                    <Link href={item.href} onClick={() => setOpen(false)}>
                      <strong>{item.title}</strong>
                      {item.message ? <span>{item.message}</span> : null}
                      <time dateTime={item.at}>{formatWhen(item.at)}</time>
                    </Link>
                  ) : (
                    <div>
                      <strong>{item.title}</strong>
                      {item.message ? <span>{item.message}</span> : null}
                      <time dateTime={item.at}>{formatWhen(item.at)}</time>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
