'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/providers/ToastProvider';
import { api, getActiveOrganizationId } from '@/lib/api';
import {
  formatDurationMinutes,
  formatLeaveDateTime,
  leaveStatusLabel,
  leaveStatusTone,
  overdueMinutes,
  type LeaveRequest,
  type LeaveSummary,
} from '@/lib/leave';

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const body = rows.map((r) => r.map((c) => escape(c ?? '')).join(',')).join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeaveReportsPage() {
  const router = useRouter();
  const { push } = useToast();
  const [summary, setSummary] = useState<LeaveSummary | null>(null);
  const [outside, setOutside] = useState<LeaveRequest[]>([]);
  const [overdue, setOverdue] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError('');
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    try {
      const [s, out, over] = await Promise.all([
        api<LeaveSummary>(`/leave-requests/summary${q}`),
        api<LeaveRequest[]>(`/gate/current-outside${q}`),
        api<LeaveRequest[]>(`/gate/overdue${q}`),
      ]);
      setSummary(s);
      setOutside(Array.isArray(out) ? out : []);
      setOverdue(Array.isArray(over) ? over : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leave reports');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    void load();
  }, [router, load]);

  function exportOutside() {
    const header = [
      'Leave Number',
      'Student ID',
      'Student Name',
      'Leave Type',
      'Destination',
      'Exit Time',
      'Expected Return',
      'Status',
      'Overdue Minutes',
    ];
    const now = new Date();
    const rows = outside.map((row) => {
      const late = overdueMinutes(row.expectedReturnTime, now);
      return [
        row.leaveNumber,
        row.student?.studentId ?? '',
        row.student?.fullName ?? '',
        row.leaveType?.name ?? '',
        row.destination,
        row.actualExitTime ?? '',
        row.expectedReturnTime ?? '',
        row.status,
        late != null && late > 0 ? String(Math.round(late)) : '0',
      ];
    });
    downloadCsv(`students-outside-${new Date().toISOString().slice(0, 10)}.csv`, [
      header,
      ...rows,
    ]);
    push({ kind: 'success', title: 'CSV exported', message: `${outside.length} rows` });
  }

  const kpis = summary
    ? [
        { label: 'Outside', value: summary.outside, href: '/leave/outside' },
        { label: 'Returned today', value: summary.returnedToday },
        { label: 'Pending', value: summary.pending, href: '/leave' },
        { label: 'Approved today', value: summary.approvedToday },
        { label: 'Rejected today', value: summary.rejectedToday },
        { label: 'Overdue', value: summary.overdue, href: '/leave/outside', warn: summary.overdue > 0 },
        {
          label: 'Avg duration',
          value:
            summary.avgDurationMinutes != null
              ? formatDurationMinutes(summary.avgDurationMinutes)
              : '—',
        },
        {
          label: 'Top leave type',
          value: summary.topLeaveType
            ? `${summary.topLeaveType.name} (${summary.topLeaveType.count})`
            : '—',
        },
      ]
    : [];

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="page-title">Leave Reports</h1>
          <p className="page-sub">KPIs for leave & gate activity, plus currently outside.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void load(true)}
            disabled={refreshing || loading}
          >
            <RefreshCw
              size={15}
              strokeWidth={1.75}
              aria-hidden
              className={refreshing ? 'spin' : undefined}
            />
            Refresh
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={exportOutside}
            disabled={loading || outside.length === 0}
          >
            <Download size={15} strokeWidth={1.75} aria-hidden />
            Export outside CSV
          </Button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="dash-stats" aria-label="Leave KPIs" style={{ marginBottom: 16 }}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div className="dash-stat" key={i}>
                <Skeleton height={12} width="50%" />
                <Skeleton height={28} width="40%" />
              </div>
            ))
          : kpis.map((card) => (
              <div
                className={`dash-stat ${card.warn ? 'is-warn' : ''}`}
                key={card.label}
                role={card.href ? 'link' : undefined}
                tabIndex={card.href ? 0 : undefined}
                onClick={card.href ? () => router.push(card.href!) : undefined}
                onKeyDown={
                  card.href
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(card.href!);
                        }
                      }
                    : undefined
                }
                style={card.href ? { cursor: 'pointer' } : undefined}
              >
                <span className="dash-stat-label">{card.label}</span>
                <strong>{card.value}</strong>
              </div>
            ))}
      </section>

      <div className="dash-grid">
        <section className="panel dash-panel">
          <div className="dash-panel-head">
            <h2>Currently outside</h2>
            <Link href="/leave/outside" className="dash-link">
              View all
            </Link>
          </div>
          {loading ? (
            <Skeleton height={120} />
          ) : outside.length === 0 ? (
            <EmptyState title="Nobody outside right now" />
          ) : (
            <div className="table-wrap">
              <table className="table zebra">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Type</th>
                    <th>Expected return</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {outside.slice(0, 12).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/leave/${row.id}`} className="table-link">
                          {row.student?.fullName}
                        </Link>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>
                          {row.student?.studentId}
                        </div>
                      </td>
                      <td>{row.leaveType?.name ?? '—'}</td>
                      <td>{formatLeaveDateTime(row.expectedReturnTime)}</td>
                      <td>
                        <StatusChip tone={leaveStatusTone(row.status)}>
                          {leaveStatusLabel(row.status)}
                        </StatusChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel dash-panel">
          <div className="dash-panel-head">
            <h2>Overdue</h2>
            <span className="muted">{overdue.length}</span>
          </div>
          {loading ? (
            <Skeleton height={120} />
          ) : overdue.length === 0 ? (
            <EmptyState title="No overdue leaves" />
          ) : (
            <div className="table-wrap">
              <table className="table zebra">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Expected return</th>
                    <th>Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.slice(0, 12).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/leave/${row.id}`} className="table-link">
                          {row.student?.fullName}
                        </Link>
                      </td>
                      <td>{formatLeaveDateTime(row.expectedReturnTime)}</td>
                      <td>
                        <StatusChip tone="warning">
                          {formatDurationMinutes(overdueMinutes(row.expectedReturnTime))}
                        </StatusChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
