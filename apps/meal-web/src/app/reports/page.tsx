'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, getActiveOrganizationId } from '@/lib/api';

type Daily = {
  period: string;
  total: number;
  bySession: Record<string, number>;
};

export default function ReportsPage() {
  const router = useRouter();
  const [daily, setDaily] = useState<Daily | null>(null);
  const [weekly, setWeekly] = useState<Daily | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    Promise.all([api<Daily>(`/reports/daily${q}`), api<Daily>(`/reports/weekly${q}`)])
      .then(([d, w]) => {
        setDaily(d);
        setWeekly(w);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <AppShell>
      <h1 className="page-title">Reports</h1>
      <p className="page-sub">Meal volume at a glance. Full PDF/Excel export comes later.</p>
      {error ? <p className="error">{error}</p> : null}
      {loading ? (
        <div className="grid">
          <div className="stat">
            <Skeleton height={12} width="40%" />
            <Skeleton height={28} width="30%" />
          </div>
          <div className="stat">
            <Skeleton height={12} width="40%" />
            <Skeleton height={28} width="30%" />
          </div>
        </div>
      ) : !daily && !weekly ? (
        <EmptyState title="No report data" description="Serve meals to populate reports." />
      ) : (
        <div className="grid">
          <div className="stat">
            <span className="muted">Meals today</span>
            <strong>{daily?.total ?? 0}</strong>
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              {Object.entries(daily?.bySession ?? {})
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ') || 'No sessions yet'}
            </div>
          </div>
          <div className="stat">
            <span className="muted">Meals this week</span>
            <strong>{weekly?.total ?? 0}</strong>
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              Last 7 days
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
