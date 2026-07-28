'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, getActiveOrganizationId } from '@/lib/api';
import {
  formatDurationMinutes,
  formatLeaveDateTime,
  leaveStatusLabel,
  leaveStatusTone,
  overdueMinutes,
  type LeaveRequest,
} from '@/lib/leave';

type Tab = 'outside' | 'overdue';

export default function StudentsOutsidePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('outside');
  const [outside, setOutside] = useState<LeaveRequest[]>([]);
  const [overdue, setOverdue] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    setLoading(true);
    Promise.all([
      api<LeaveRequest[]>(`/gate/current-outside${q}`),
      api<LeaveRequest[]>(`/gate/overdue${q}`),
    ])
      .then(([a, b]) => {
        setOutside(Array.isArray(a) ? a : []);
        setOverdue(Array.isArray(b) ? b : []);
      })
      .catch((err: Error) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));

    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(tick);
  }, [router]);

  const rows = tab === 'outside' ? outside : overdue;

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="page-title">Students Outside</h1>
          <p className="page-sub">Who is currently checked out, and who is overdue.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn ${tab === 'outside' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setTab('outside')}
        >
          Currently Outside ({outside.length})
        </button>
        <button
          type="button"
          className={`btn ${tab === 'overdue' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setTab('overdue')}
        >
          Overdue ({overdue.length})
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={tab === 'outside' ? 'Nobody outside' : 'No overdue leaves'}
          description={
            tab === 'outside'
              ? 'Students appear here after an approved exit scan.'
              : 'Overdue students will show when expected return has passed.'
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table zebra">
            <thead>
              <tr>
                <th>Student</th>
                <th>Leave type</th>
                <th>Exit time</th>
                <th>Expected return</th>
                <th>Overdue</th>
                <th>Status</th>
                <th>Leave</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const late = overdueMinutes(row.expectedReturnTime, now);
                return (
                  <tr key={row.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.student?.fullName ?? '—'}</div>
                      <div className="muted" style={{ fontSize: '0.75rem' }}>
                        {row.student?.studentId}
                      </div>
                    </td>
                    <td>{row.leaveType?.name ?? '—'}</td>
                    <td>{formatLeaveDateTime(row.actualExitTime)}</td>
                    <td>{formatLeaveDateTime(row.expectedReturnTime)}</td>
                    <td>
                      {late != null && late > 0 ? (
                        <StatusChip tone="warning">{formatDurationMinutes(late)}</StatusChip>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <StatusChip tone={leaveStatusTone(row.status)}>
                        {leaveStatusLabel(row.status)}
                      </StatusChip>
                    </td>
                    <td>
                      <Link href={`/leave/${row.id}`} className="table-link">
                        {row.leaveNumber}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
