'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { getActiveOrganizationId } from '@/lib/api';

type MealRow = {
  id: string;
  mealCode: string;
  mealDate: string;
  servedAt: string;
  status: string;
  student?: { id: string; studentId: string; fullName: string };
  campus?: { shortName: string; name: string };
  mentor?: { fullName: string } | null;
};

export default function MealHistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<MealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    const orgId = getActiveOrganizationId();
    const qs = new URLSearchParams({
      page: '1',
      limit: '50',
      ...(orgId ? { organizationId: orgId } : {}),
    });
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/meals/history?${qs}`, {
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
      <h1 className="page-title">Meal History</h1>
      <p className="page-sub">Recent meal records — click a student to see their full meal profile.</p>
      {error ? <p className="error">{error}</p> : null}
      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No meals recorded yet"
          description="Serve meals from the distribution station to build history."
        />
      ) : (
        <div className="table-wrap">
          <table className="table zebra">
            <thead>
              <tr>
                <th>When</th>
                <th>Student</th>
                <th>Session</th>
                <th>Campus</th>
                <th>Mentor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td>
                    {new Date(m.servedAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>
                    {m.student?.id ? (
                      <Link href={`/students/${m.student.id}`} className="table-link">
                        <div style={{ fontWeight: 500 }}>{m.student.fullName}</div>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>
                          {m.student.studentId}
                        </div>
                      </Link>
                    ) : (
                      <>
                        <div style={{ fontWeight: 500 }}>{m.student?.fullName ?? '—'}</div>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>
                          {m.student?.studentId}
                        </div>
                      </>
                    )}
                  </td>
                  <td>{m.mealCode}</td>
                  <td>{m.campus?.shortName ?? m.campus?.name ?? '—'}</td>
                  <td>{m.mentor?.fullName ?? '—'}</td>
                  <td>
                    <StatusChip
                      tone={
                        m.status === 'SERVED'
                          ? 'success'
                          : m.status === 'OVERRIDDEN'
                            ? 'warning'
                            : 'info'
                      }
                    >
                      {m.status}
                    </StatusChip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
