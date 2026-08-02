'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  FileSpreadsheet,
  Images,
  Presentation,
  Search,
  Tags,
  Timeline,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { AddButton } from '@/components/ui/AddButton';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/providers/ToastProvider';
import { api, apiWithMeta, getActiveOrganizationId } from '@/lib/api';
import {
  activityStatusLabel,
  activityStatusTone,
  formatActivityDate,
  type ActivityReport,
  type ActivitySummary,
} from '@/lib/activity';
import {
  canCreateActivity,
  canExportActivity,
  canManageActivityCategories,
  canViewActivitySummary,
  readStoredUser,
} from '@/lib/rbac';

const STATUSES = [
  '',
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'ARCHIVED',
] as const;

export default function ActivityReportsPage() {
  const router = useRouter();
  const { push } = useToast();
  const [items, setItems] = useState<ActivityReport[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canCreate, setCanCreate] = useState(false);
  const [canCategories, setCanCategories] = useState(false);
  const [canExport, setCanExport] = useState(false);
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
      const { data, meta } = await apiWithMeta<ActivityReport[]>(`/activity-reports?${qs}`);
      const rows = Array.isArray(data) ? data : [];
      setItems(rows);
      setTotal(Number(meta.total ?? rows.length));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity reports');
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
    setCanCreate(canCreateActivity(user));
    setCanCategories(canManageActivityCategories(user));
    setCanExport(canExportActivity(user));
    setShowSummary(canViewActivitySummary(user));
    const initialStatus = new URLSearchParams(window.location.search).get('status');
    if (initialStatus) setStatus(initialStatus);
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
    const qs = orgId ? `?organizationId=${orgId}` : '';
    api<ActivitySummary>(`/activity-reports/summary${qs}`)
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
        row.reportNumber,
        row.title,
        row.status,
        row.category?.name,
        row.campus?.name,
        row.campus?.shortName,
        row.submittedBy?.fullName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q]);

  const pages = Math.max(1, Math.ceil(total / limit));

  async function onExport() {
    const orgId = getActiveOrganizationId();
    const qs = new URLSearchParams({
      ...(orgId ? { organizationId: orgId } : {}),
      ...(status ? { status } : {}),
    });
    try {
      const data = await api<{ count: number; items: ActivityReport[] }>(
        `/activity-reports/export?${qs}`,
      );
      const rows = Array.isArray(data.items) ? data.items : [];
      const header = [
        'Report Number',
        'Title',
        'Category',
        'Campus',
        'Date',
        'Status',
        'Participants',
        'Photos',
        'Reported By',
      ];
      const lines = [
        header.join(','),
        ...rows.map((r) =>
          [
            r.reportNumber,
            `"${(r.title ?? '').replace(/"/g, '""')}"`,
            r.category?.name ?? '',
            r.campus?.shortName ?? r.campus?.name ?? '',
            formatActivityDate(r.reportDate),
            r.status,
            r.participantCount,
            r._count?.media ?? r.media?.length ?? 0,
            r.submittedBy?.fullName ?? '',
          ].join(','),
        ),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-reports-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      push({ kind: 'success', title: 'Export ready', message: `${rows.length} reports` });
    } catch (err) {
      push({
        kind: 'error',
        title: 'Export failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    }
  }

  return (
    <AppShell>
      <header className="activity-head">
        <div className="activity-head-text">
          <h1>Activity reports</h1>
          <p>Campus day records — photos, voice notes, approvals.</p>
        </div>
        <div className="activity-head-actions">
          {summary ? (
            <div className="activity-mini-stats" aria-label="Summary">
              <span>
                <strong>{summary.pendingApprovals}</strong> pending
              </span>
              <span className="activity-mini-dot" aria-hidden />
              <span>
                <strong>{summary.activitiesToday}</strong> today
              </span>
              <span className="activity-mini-dot" aria-hidden />
              <span>
                <strong>{summary.weeklyActivityCount}</strong> this week
              </span>
            </div>
          ) : null}
          {canCreate ? (
            <AddButton label="New report" onClick={() => router.push('/activity/new')} />
          ) : null}
        </div>
      </header>

      <div className="activity-controls">
        <div className="activity-links">
          <button type="button" onClick={() => router.push('/activity/timeline')}>
            <Timeline size={14} strokeWidth={1.75} aria-hidden />
            Timeline
          </button>
          <button type="button" onClick={() => router.push('/activity/gallery')}>
            <Images size={14} strokeWidth={1.75} aria-hidden />
            Gallery
          </button>
          <button type="button" onClick={() => router.push('/activity/presentation')}>
            <Presentation size={14} strokeWidth={1.75} aria-hidden />
            Present
          </button>
          {canCategories ? (
            <button type="button" onClick={() => router.push('/activity/categories')}>
              <Tags size={14} strokeWidth={1.75} aria-hidden />
              Categories
            </button>
          ) : null}
          {canExport ? (
            <button type="button" onClick={() => void onExport()}>
              <FileSpreadsheet size={14} strokeWidth={1.75} aria-hidden />
              Export
            </button>
          ) : null}
        </div>

        <div className="activity-filters">
          <label className="activity-search">
            <Search size={15} strokeWidth={1.75} aria-hidden />
            <Input
              placeholder="Search reports…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Search reports"
            />
          </label>
          <select
            className="select activity-status-select"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUSES.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {activityStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="activity-list panel">
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="activity-empty">
          <h2>{q || status ? 'No matching reports' : 'No reports yet'}</h2>
          <p>
            {q || status
              ? 'Clear search or status to see everything.'
              : 'Create a report for today’s campus activity.'}
          </p>
          <div className="activity-empty-actions">
            {(q || status) && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDraft('');
                  setQ('');
                  setPage(1);
                  setStatus('');
                }}
              >
                Clear filters
              </Button>
            )}
            {canCreate ? (
              <AddButton label="New report" onClick={() => router.push('/activity/new')} />
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="activity-list panel" role="list">
            {filtered.map((row) => {
              const mediaCount = row._count?.media ?? row.media?.length ?? 0;
              return (
                <Link
                  key={row.id}
                  href={`/activity/${row.id}`}
                  className="activity-row"
                  role="listitem"
                >
                  <div className="activity-row-main">
                    <div className="activity-row-title-line">
                      <h2>{row.title}</h2>
                      <StatusChip tone={activityStatusTone(row.status)}>
                        {activityStatusLabel(row.status)}
                      </StatusChip>
                    </div>
                    <p className="activity-row-meta">
                      <span>{row.reportNumber}</span>
                      <span aria-hidden>·</span>
                      <span>{row.category?.name ?? 'Uncategorized'}</span>
                      <span aria-hidden>·</span>
                      <span>{row.campus?.shortName ?? row.campus?.name ?? '—'}</span>
                      <span aria-hidden>·</span>
                      <span>{formatActivityDate(row.reportDate)}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {row.participantCount ?? 0} people · {mediaCount} media
                      </span>
                    </p>
                    {row.submittedBy?.fullName ? (
                      <p className="activity-row-by">By {row.submittedBy.fullName}</p>
                    ) : null}
                  </div>
                  <ChevronRight
                    className="activity-row-chevron"
                    size={18}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </Link>
              );
            })}
          </div>
          <div className="pager">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="muted">
              {filtered.length} shown · {total} total · page {page}/{pages}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </AppShell>
  );
}
