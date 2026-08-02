'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, FileBarChart, Tags } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { AddButton } from '@/components/ui/AddButton';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { api, apiWithMeta, getActiveOrganizationId } from '@/lib/api';
import {
  formatIncidentWhen,
  incidentStatusLabel,
  incidentStatusTone,
  severityTone,
  type DisciplinaryIncident,
  type DisciplinarySummary,
} from '@/lib/disciplinary';
import {
  canCreateDisciplinary,
  canManageDisciplinaryTypes,
  canViewDisciplinarySummary,
  readStoredUser,
} from '@/lib/rbac';

const STATUSES = [
  '',
  'OPEN',
  'UNDER_INVESTIGATION',
  'AWAITING_DECISION',
  'ACTION_ASSIGNED',
  'CLOSED',
  'APPEALED',
] as const;

export default function DisciplinaryListPage() {
  const router = useRouter();
  const [items, setItems] = useState<DisciplinaryIncident[]>([]);
  const [summary, setSummary] = useState<DisciplinarySummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canCreate, setCanCreate] = useState(false);
  const [canTypes, setCanTypes] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const limit = 20;

  async function load() {
    const orgId = getActiveOrganizationId();
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(orgId ? { organizationId: orgId } : {}),
      ...(status ? { status } : {}),
    });
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await apiWithMeta<DisciplinaryIncident[]>(
        `/disciplinary-incidents?${qs}`,
      );
      const rows = Array.isArray(data) ? data : [];
      setItems(rows);
      setTotal(Number(meta.total ?? rows.length));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load incidents');
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
    const user = readStoredUser();
    setCanCreate(canCreateDisciplinary(user));
    setCanTypes(canManageDisciplinaryTypes(user));
    setShowSummary(canViewDisciplinarySummary(user));
  }, [router]);

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  useEffect(() => {
    if (!showSummary) return;
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    api<DisciplinarySummary>(`/disciplinary-incidents/summary${q}`)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [showSummary]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = draft.trim();
      if (next === q) return;
      setQ(next);
    }, 250);
    return () => window.clearTimeout(t);
  }, [draft, q]);

  const filtered = useMemo(() => {
    if (!q) return items;
    const needle = q.toLowerCase();
    return items.filter((row) => {
      const hay = [
        row.incidentNumber,
        row.status,
        row.severity,
        row.student?.fullName,
        row.student?.studentId,
        row.incidentType?.name,
        row.incidentType?.category,
        row.reportedBy?.fullName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q]);

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="page-title">Disciplinary Management</h1>
          <p className="page-sub">
            Record incidents, investigate cases, assign actions, and close the loop.
          </p>
        </div>
        <div className="dash-head-actions">
          {canTypes ? (
            <Button type="button" variant="secondary" onClick={() => router.push('/disciplinary/types')}>
              <Tags size={15} strokeWidth={1.75} aria-hidden />
              Types
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => router.push('/disciplinary/reports')}>
            <FileBarChart size={15} strokeWidth={1.75} aria-hidden />
            Reports
          </Button>
          {canCreate ? (
            <AddButton label="Report incident" onClick={() => router.push('/disciplinary/new')} />
          ) : null}
        </div>
      </div>

      {summary ? (
        <section className="dash-stats" aria-label="Disciplinary summary" style={{ marginBottom: 8 }}>
          {[
            { label: 'Open cases', value: summary.openCases },
            { label: 'Under action', value: summary.studentsUnderAction },
            { label: 'Incidents today', value: summary.incidentsToday },
            { label: 'High severity', value: summary.highSeverityOpen },
            { label: 'Repeat offenders', value: summary.repeatOffenders },
          ].map((card) => (
            <div className="dash-stat" key={card.label}>
              <span className="dash-stat-label">{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </section>
      ) : null}

      <div
        style={{
          marginTop: 16,
          marginBottom: 12,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 220px)',
          gap: 10,
        }}
      >
        <Input
          placeholder="Search number, student, type…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <select
          className="select"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {incidentStatusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={40} />
          <Skeleton height={220} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No disciplinary cases"
          description={canCreate ? 'Report an incident to open the first case.' : 'No cases match these filters.'}
          actionLabel={canCreate ? 'Report incident' : undefined}
          onAction={canCreate ? () => router.push('/disciplinary/new') : undefined}
        />
      ) : (
        <div className="table-wrap">
          <table className="table zebra">
            <thead>
              <tr>
                <th>Case</th>
                <th>Student</th>
                <th>Incident</th>
                <th>Severity</th>
                <th>Status</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/disciplinary/${row.id}`} className="table-link">
                      <strong>{row.incidentNumber}</strong>
                    </Link>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      {row.reportedBy?.fullName ?? '—'}
                    </div>
                  </td>
                  <td>
                    <strong>{row.student?.fullName ?? '—'}</strong>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      {row.student?.studentId}
                    </div>
                  </td>
                  <td>
                    {row.incidentType?.name ?? '—'}
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      {row.incidentType?.category}
                    </div>
                  </td>
                  <td>
                    <StatusChip tone={severityTone(row.severity)}>{row.severity}</StatusChip>
                  </td>
                  <td>
                    <StatusChip tone={incidentStatusTone(row.status)}>
                      {incidentStatusLabel(row.status)}
                    </StatusChip>
                  </td>
                  <td className="muted">{formatIncidentWhen(row.occurredAt)}</td>
                  <td>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => router.push(`/disciplinary/${row.id}`)}
                    >
                      <Eye size={14} strokeWidth={1.75} aria-hidden />
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="pagination" style={{ marginTop: 12 }}>
          <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="muted">
            Page {page} of {pages}
          </span>
          <Button type="button" variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </AppShell>
  );
}
