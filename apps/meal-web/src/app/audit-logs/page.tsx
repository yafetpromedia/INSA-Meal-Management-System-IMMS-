'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

type AuditRow = {
  id: string;
  timestamp: string;
  action: string;
  resource?: string | null;
  ipAddress?: string | null;
  user?: { fullName?: string; email?: string } | null;
};

export default function AuditLogsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/audit-logs?page=1&limit=50`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('imms_access') ?? ''}` },
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || body.success === false) throw new Error(body.message ?? 'Failed');
        setItems(body.data ?? []);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <AppShell>
      <h1 className="page-title">Audit Logs</h1>
      <p className="page-sub">Immutable activity history. Read-only.</p>
      {error ? <p className="error">{error}</p> : null}
      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No audit events" description="Actions will appear here as staff use the system." />
      ) : (
        <div className="table-wrap">
          <table className="table zebra compact">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>
                    {new Date(a.timestamp).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>{a.user?.fullName ?? a.user?.email ?? '—'}</td>
                  <td style={{ fontWeight: 500 }}>{a.action}</td>
                  <td className="muted">{a.resource ?? '—'}</td>
                  <td className="muted">{a.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
