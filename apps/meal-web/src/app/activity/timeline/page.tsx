'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, getActiveOrganizationId } from '@/lib/api';
import {
  activityStatusLabel,
  activityStatusTone,
  formatActivityDate,
  type ActivityTimelineDay,
} from '@/lib/activity';

type Campus = { id: string; name: string; shortName?: string | null };

export default function ActivityTimelinePage() {
  const router = useRouter();
  const [days, setDays] = useState<ActivityTimelineDay[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusId, setCampusId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }
    const orgId = getActiveOrganizationId();
    const qs = orgId ? `?organizationId=${orgId}` : '';
    api<Campus[]>(`/campuses${qs}`)
      .then((data) => setCampuses(Array.isArray(data) ? data : []))
      .catch(() => setCampuses([]));
  }, [router]);

  useEffect(() => {
    const orgId = getActiveOrganizationId();
    const qs = new URLSearchParams({
      days: '45',
      ...(orgId ? { organizationId: orgId } : {}),
      ...(campusId ? { campusId } : {}),
    });
    setLoading(true);
    setError('');
    api<ActivityTimelineDay[]>(`/activity-reports/timeline?${qs}`)
      .then((data) => setDays(Array.isArray(data) ? data : []))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [campusId]);

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <Link href="/activity" className="profile-back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Activity reports
          </Link>
          <h1 className="page-title">Campus activity timeline</h1>
          <p className="page-sub">Day-by-day view of submitted activities and photo counts.</p>
        </div>
        <select
          className="select"
          value={campusId}
          onChange={(e) => setCampusId(e.target.value)}
          aria-label="Campus filter"
        >
          <option value="">All campuses in scope</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.shortName ?? c.name}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </div>
      ) : days.length === 0 ? (
        <EmptyState title="No timeline entries" description="Reports in the selected period will appear here." />
      ) : (
        <div className="activity-timeline">
          {days.map((day) => (
            <section className="panel activity-timeline-day" key={day.date}>
              <header>
                <h2>{formatActivityDate(day.date)}</h2>
                <span className="muted">📷 {day.photoCount} photos</span>
              </header>
              <ul>
                {day.reports.map((r) => (
                  <li key={r.id}>
                    <Link href={`/activity/${r.id}`} className="table-link">
                      {r.title}
                    </Link>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.category?.name}
                      {r.campus ? ` · ${r.campus.shortName ?? r.campus.name}` : ''} ·{' '}
                      {r._count?.media ?? 0} photos
                    </div>
                    <StatusChip tone={activityStatusTone(r.status)}>
                      {activityStatusLabel(r.status)}
                    </StatusChip>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
