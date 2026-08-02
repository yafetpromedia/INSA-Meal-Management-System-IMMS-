'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/providers/ToastProvider';
import { api, getActiveOrganizationId } from '@/lib/api';
import {
  formatIncidentWhen,
  incidentStatusLabel,
  incidentStatusTone,
  severityTone,
  type DisciplinaryIncident,
} from '@/lib/disciplinary';

type ReportPayload = {
  byStatus: Array<{ status: string; count: number }>;
  bySeverity: Array<{ severity: string; count: number }>;
  byCampus: Array<{
    campusId: string;
    count: number;
    campus?: { name: string; shortName?: string | null } | null;
  }>;
  byMentor: Array<{
    reportedById: string;
    count: number;
    mentor?: { fullName: string } | null;
  }>;
  items: DisciplinaryIncident[];
  count: number;
};

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const body = rows.map((r) => r.map((c) => escape(c)).join(',')).join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DisciplinaryReportsPage() {
  const router = useRouter();
  const { push } = useToast();
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function load() {
    const orgId = getActiveOrganizationId();
    const qs = new URLSearchParams({
      ...(orgId ? { organizationId: orgId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    setLoading(true);
    try {
      const report = await api<ReportPayload>(`/disciplinary-incidents/reports?${qs}`);
      setData(report);
    } catch (err) {
      push({
        kind: 'error',
        title: 'Reports failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function exportCsv() {
    if (!data?.items?.length) {
      push({ kind: 'error', title: 'Nothing to export' });
      return;
    }
    const rows = [
      ['Incident #', 'Date', 'Student', 'Student ID', 'Type', 'Severity', 'Status', 'Reported by', 'Campus'],
      ...data.items.map((i) => [
        i.incidentNumber,
        i.occurredAt,
        i.student?.fullName ?? '',
        i.student?.studentId ?? '',
        i.incidentType?.name ?? '',
        i.severity,
        i.status,
        i.reportedBy?.fullName ?? '',
        i.campus?.shortName || i.campus?.name || '',
      ]),
    ];
    downloadCsv(`disciplinary-report-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    push({ kind: 'success', title: 'CSV exported', message: `${data.count} rows` });
  }

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <Link href="/disciplinary" className="profile-back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Disciplinary cases
          </Link>
          <h1 className="page-title">Disciplinary reports</h1>
          <p className="page-sub">Trends by status, severity, campus, and mentor.</p>
        </div>
        <Button type="button" onClick={exportCsv} disabled={!data?.items?.length}>
          <Download size={15} strokeWidth={1.75} aria-hidden />
          Export CSV
        </Button>
      </div>

      <form
        className="panel reports-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
        style={{ marginBottom: 16 }}
      >
        <label className="reports-filter">
          <span>From</span>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="reports-filter">
          <span>To</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="reports-filter-actions">
          <Button type="submit" size="sm">
            Apply
          </Button>
        </div>
      </form>

      {loading ? (
        <Skeleton height={220} />
      ) : !data ? (
        <EmptyState title="No report data" />
      ) : (
        <>
          <div className="reports-grid">
            <section className="panel">
              <h3 className="profile-section-title">By status</h3>
              <ul className="profile-bars">
                {data.byStatus.map((r) => (
                  <li key={r.status}>
                    <div className="profile-bar-label">
                      <StatusChip tone={incidentStatusTone(r.status)}>
                        {incidentStatusLabel(r.status)}
                      </StatusChip>
                      <span>{r.count}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel">
              <h3 className="profile-section-title">By severity</h3>
              <ul className="profile-bars">
                {data.bySeverity.map((r) => (
                  <li key={r.severity}>
                    <div className="profile-bar-label">
                      <StatusChip tone={severityTone(r.severity)}>{r.severity}</StatusChip>
                      <span>{r.count}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel">
              <h3 className="profile-section-title">By campus</h3>
              <ul className="profile-bars">
                {data.byCampus.map((r) => (
                  <li key={r.campusId}>
                    <div className="profile-bar-label">
                      <strong>{r.campus?.shortName || r.campus?.name || 'Campus'}</strong>
                      <span>{r.count}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel">
              <h3 className="profile-section-title">Mentor reports</h3>
              <ul className="profile-bars">
                {data.byMentor.map((r) => (
                  <li key={r.reportedById}>
                    <div className="profile-bar-label">
                      <strong>{r.mentor?.fullName ?? 'Staff'}</strong>
                      <span>{r.count}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="panel" style={{ marginTop: 16 }}>
            <h3 className="profile-section-title">Cases in range ({data.count})</h3>
            {!data.items.length ? (
              <EmptyState title="No cases in this range" />
            ) : (
              <div className="table-wrap">
                <table className="table zebra">
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Student</th>
                      <th>Type</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.slice(0, 50).map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Link href={`/disciplinary/${i.id}`} className="table-link">
                            {i.incidentNumber}
                          </Link>
                        </td>
                        <td>{i.student?.fullName}</td>
                        <td>{i.incidentType?.name}</td>
                        <td>
                          <StatusChip tone={severityTone(i.severity)}>{i.severity}</StatusChip>
                        </td>
                        <td>
                          <StatusChip tone={incidentStatusTone(i.status)}>
                            {incidentStatusLabel(i.status)}
                          </StatusChip>
                        </td>
                        <td className="muted">{formatIncidentWhen(i.occurredAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
