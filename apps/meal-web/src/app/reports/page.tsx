'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CalendarDays,
  Download,
  RefreshCw,
  UtensilsCrossed,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { api, getActiveOrganizationId } from '@/lib/api';
import { formatEthiopiaTime } from '@/lib/timezone';

type Period = {
  period: string;
  total: number;
  bySession: Record<string, number>;
  from?: string;
  to?: string;
};

type Trend = {
  days: number;
  total: number;
  points: { date: string; label: string; total: number }[];
};

type CampusReport = {
  groupBy: string;
  items: { campus?: { id: string; name: string; shortName?: string | null } | null; count: number }[];
};

type MealExport = {
  count: number;
  items: {
    id: string;
    mealCode: string;
    servedAt: string;
    mealDate: string;
    studentId: string;
    studentName: string;
    barcode?: string | null;
    campus: string;
    program?: string | null;
  }[];
};

type Option = { id: string; name: string; shortName?: string | null; code?: string };
type SessionOpt = { id: string; code: string; name: string; isActive?: boolean };

type PeriodKey = 'daily' | 'weekly' | 'monthly';

type Filters = {
  campusId: string;
  programId: string;
  mealCode: string;
  from: string;
  to: string;
};

const emptyFilters: Filters = {
  campusId: '',
  programId: '',
  mealCode: '',
  from: '',
  to: '',
};

function sessionLabel(code: string) {
  const c = code.toUpperCase();
  if (c.includes('BREAKFAST')) return 'Breakfast';
  if (c.includes('LUNCH')) return 'Lunch';
  if (c.includes('DINNER')) return 'Dinner';
  return code;
}

function sessionOrder(code: string) {
  const c = code.toUpperCase();
  if (c.includes('BREAKFAST')) return 0;
  if (c.includes('LUNCH')) return 1;
  if (c.includes('DINNER')) return 2;
  return 3;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', {
    timeZone: 'Africa/Addis_Ababa',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${day} · ${formatEthiopiaTime(d)}`;
}

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

function buildQuery(filters: Filters) {
  const orgId = getActiveOrganizationId();
  const qs = new URLSearchParams();
  if (orgId) qs.set('organizationId', orgId);
  if (filters.campusId) qs.set('campusId', filters.campusId);
  if (filters.programId) qs.set('programId', filters.programId);
  if (filters.mealCode) qs.set('mealCode', filters.mealCode);
  if (filters.from) qs.set('from', filters.from);
  if (filters.to) qs.set('to', filters.to);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export default function ReportsPage() {
  const router = useRouter();
  const { push } = useToast();
  const [daily, setDaily] = useState<Period | null>(null);
  const [weekly, setWeekly] = useState<Period | null>(null);
  const [monthly, setMonthly] = useState<Period | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [campus, setCampus] = useState<CampusReport | null>(null);
  const [recent, setRecent] = useState<MealExport['items']>([]);
  const [period, setPeriod] = useState<PeriodKey>('daily');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [campuses, setCampuses] = useState<Option[]>([]);
  const [programs, setPrograms] = useState<Option[]>([]);
  const [sessions, setSessions] = useState<SessionOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const hasFilters = Boolean(
    filters.campusId || filters.programId || filters.mealCode || filters.from || filters.to,
  );
  const hasDateRange = Boolean(filters.from || filters.to);

  const loadMeta = useCallback(async () => {
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    try {
      const [c, p, s] = await Promise.all([
        api<Option[]>(`/campuses${q}`),
        api<Option[]>(`/programs${q}`),
        api<SessionOpt[]>(`/meal-sessions${q}`),
      ]);
      setCampuses(Array.isArray(c) ? c : []);
      setPrograms(Array.isArray(p) ? p : []);
      setSessions(Array.isArray(s) ? s.filter((x) => x.isActive !== false) : []);
    } catch {
      // Filter dropdowns are optional if user lacks list permissions.
    }
  }, []);

  const load = useCallback(
    async (soft = false, nextFilters: Filters = filters) => {
      if (soft) setRefreshing(true);
      else setLoading(true);
      setError('');
      const q = buildQuery(nextFilters);
      const trendQs = new URLSearchParams(q.startsWith('?') ? q.slice(1) : q);
      if (!nextFilters.from && !nextFilters.to) trendQs.set('days', '7');
      const trendQ = trendQs.toString() ? `?${trendQs}` : '?days=7';
      try {
        const [d, w, m, t, c, meals] = await Promise.all([
          api<Period>(`/reports/daily${q}`),
          api<Period>(`/reports/weekly${q}`),
          api<Period>(`/reports/monthly${q}`),
          api<Trend>(`/reports/trend${trendQ}`),
          api<CampusReport>(`/reports/campus${q}`),
          api<MealExport>(`/reports/meals${q}`),
        ]);
        setDaily(d);
        setWeekly(w);
        setMonthly(m);
        setTrend(t);
        setCampus(c);
        setRecent(Array.isArray(meals?.items) ? meals.items.slice(0, 12) : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reports');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    void loadMeta();
  }, [router, loadMeta]);

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) return;
    const soft = filters !== emptyFilters;
    // First paint: load immediately; later filter changes debounce
    const delay = soft || filters.from || filters.to || filters.campusId || filters.programId || filters.mealCode ? 280 : 0;
    const t = window.setTimeout(() => {
      void load(Boolean(delay), filters);
    }, delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    if (hasDateRange) setPeriod('daily');
  }, [hasDateRange]);

  const activePeriod = period === 'daily' ? daily : period === 'weekly' ? weekly : monthly;

  const sessionRows = useMemo(() => {
    const entries = Object.entries(activePeriod?.bySession ?? {}).sort(
      (a, b) => sessionOrder(a[0]) - sessionOrder(b[0]) || b[1] - a[1],
    );
    return entries;
  }, [activePeriod]);

  const campusRows = useMemo(() => {
    return (campus?.items ?? []).filter((i) => i.campus);
  }, [campus]);

  const trendMax = Math.max(1, ...(trend?.points.map((p) => p.total) ?? [1]));
  const campusMax = Math.max(1, ...campusRows.map((r) => r.count), 1);
  const sessionMax = Math.max(1, ...sessionRows.map(([, n]) => n), 1);
  const trendCols = Math.min(14, Math.max(7, trend?.points.length ?? 7));

  const kpis = [
    {
      key: 'daily' as const,
      label: hasDateRange ? 'In range' : 'Today',
      hint: hasDateRange ? 'Selected dates' : 'Ethiopia calendar day',
      value: daily?.total ?? 0,
      sessions: daily?.bySession ?? {},
    },
    {
      key: 'weekly' as const,
      label: hasDateRange ? 'Range · 7d view' : 'Last 7 days',
      hint: 'Including today',
      value: weekly?.total ?? 0,
      sessions: weekly?.bySession ?? {},
      hide: hasDateRange,
    },
    {
      key: 'monthly' as const,
      label: hasDateRange ? 'Range · 30d view' : 'Last 30 days',
      hint: 'Rolling window',
      value: monthly?.total ?? 0,
      sessions: monthly?.bySession ?? {},
      hide: hasDateRange,
    },
  ].filter((k) => !k.hide);

  async function exportCsv() {
    setExporting(true);
    try {
      const q = buildQuery(filters);
      let data: MealExport;
      try {
        data = await api<MealExport>(`/reports/export${q}`);
      } catch {
        data = await api<MealExport>(`/reports/meals${q}`);
      }
      const rows = [
        ['Served at', 'Meal', 'Student ID', 'Student', 'Campus', 'Program', 'Barcode'],
        ...(data.items ?? []).map((m) => [
          new Date(m.servedAt).toISOString(),
          m.mealCode,
          m.studentId,
          m.studentName,
          m.campus,
          m.program ?? '',
          m.barcode ?? '',
        ]),
      ];
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`imms-meals-${stamp}.csv`, rows);
      push({
        kind: 'success',
        title: 'Export ready',
        message: `${data.count} meal records downloaded.`,
      });
    } catch (err) {
      push({
        kind: 'error',
        title: 'Export failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setExporting(false);
    }
  }

  function clearFilters() {
    setFilters(emptyFilters);
  }

  const empty =
    !loading &&
    (daily?.total ?? 0) === 0 &&
    (weekly?.total ?? 0) === 0 &&
    (monthly?.total ?? 0) === 0;

  return (
    <AppShell>
      <div className="reports">
        <header className="dash-head">
          <div>
            <p className="dash-kicker">Meal analytics</p>
            <h1 className="page-title">Reports</h1>
            <p className="page-sub dash-sub">
              Filter by campus, program, session, or date · Ethiopian local time
            </p>
          </div>
          <div className="dash-head-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void load(true, filters)}
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
            <Button type="button" onClick={() => void exportCsv()} disabled={exporting || loading}>
              <Download size={15} strokeWidth={1.75} aria-hidden />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </div>
        </header>

        <form
          className="panel reports-filters"
          onSubmit={(e) => {
            e.preventDefault();
            void load(true, filters);
          }}
        >
          <label className="reports-filter">
            <span>Campus</span>
            <select
              className="select"
              value={filters.campusId}
              onChange={(e) => setFilters((f) => ({ ...f, campusId: e.target.value }))}
            >
              <option value="">All campuses</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.shortName || c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="reports-filter">
            <span>Program</span>
            <select
              className="select"
              value={filters.programId}
              onChange={(e) => setFilters((f) => ({ ...f, programId: e.target.value }))}
            >
              <option value="">All programs</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="reports-filter">
            <span>Meal session</span>
            <select
              className="select"
              value={filters.mealCode}
              onChange={(e) => setFilters((f) => ({ ...f, mealCode: e.target.value }))}
            >
              <option value="">All sessions</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.code}>
                  {s.name || sessionLabel(s.code)}
                </option>
              ))}
            </select>
          </label>

          <label className="reports-filter">
            <span>From</span>
            <input
              className="input"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </label>

          <label className="reports-filter">
            <span>To</span>
            <input
              className="input"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </label>

          {hasFilters ? (
            <div className="reports-filter-actions">
              <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          ) : null}
        </form>

        {error ? <p className="error">{error}</p> : null}

        {loading ? (
          <div className="reports-kpis">
            {Array.from({ length: 3 }).map((_, i) => (
              <div className="reports-kpi" key={i}>
                <Skeleton height={12} width="40%" />
                <Skeleton height={32} width="35%" />
                <Skeleton height={10} width="70%" />
              </div>
            ))}
          </div>
        ) : empty ? (
          <EmptyState
            title={hasFilters ? 'No meals match these filters' : 'No meals to report yet'}
            description={
              hasFilters
                ? 'Try another campus, session, or date range.'
                : 'Serve meals at the station and volume will show up here.'
            }
          />
        ) : (
          <>
            <section className="reports-kpis" aria-label="Period totals">
              {kpis.map((k) => {
                const parts = Object.entries(k.sessions)
                  .sort((a, b) => sessionOrder(a[0]) - sessionOrder(b[0]))
                  .map(([code, n]) => `${sessionLabel(code)} ${n}`);
                return (
                  <button
                    type="button"
                    key={k.key}
                    className={`reports-kpi ${period === k.key ? 'is-active' : ''}`}
                    onClick={() => setPeriod(k.key)}
                    aria-pressed={period === k.key}
                  >
                    <span className="reports-kpi-label">{k.label}</span>
                    <strong>{k.value}</strong>
                    <span className="reports-kpi-hint">
                      {parts.length ? parts.join(' · ') : k.hint}
                    </span>
                  </button>
                );
              })}
            </section>

            <div className="reports-grid">
              <section className="panel dash-panel">
                <div className="dash-panel-head">
                  <h2>By meal session</h2>
                  <span className="muted">
                    {hasDateRange
                      ? 'Selected range'
                      : period === 'daily'
                        ? 'Today'
                        : period === 'weekly'
                          ? '7 days'
                          : '30 days'}
                  </span>
                </div>
                {sessionRows.length === 0 ? (
                  <p className="muted reports-empty-line">No sessions in this window.</p>
                ) : (
                  <ul className="profile-bars">
                    {sessionRows.map(([code, count]) => {
                      const pct = Math.max(8, Math.round((count / sessionMax) * 100));
                      const share = activePeriod?.total
                        ? Math.round((count / activePeriod.total) * 100)
                        : 0;
                      return (
                        <li key={code}>
                          <div className="profile-bar-label">
                            <strong>{sessionLabel(code)}</strong>
                            <span>
                              {count} · {share}%
                            </span>
                          </div>
                          <div className="profile-bar-track">
                            <span style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="panel dash-panel">
                <div className="dash-panel-head">
                  <h2>{hasDateRange ? 'Daily trend' : 'Last 7 days'}</h2>
                  <span className="muted">{trend?.total ?? 0} meals</span>
                </div>
                {!trend?.points?.length ? (
                  <p className="muted reports-empty-line">No trend data yet.</p>
                ) : (
                  <div
                    className="reports-trend"
                    style={{ gridTemplateColumns: `repeat(${trendCols}, minmax(0, 1fr))` }}
                    role="img"
                    aria-label="Meals per day"
                  >
                    {trend.points.map((p) => {
                      const h = Math.max(4, Math.round((p.total / trendMax) * 100));
                      return (
                        <div className="reports-trend-col" key={p.date}>
                          <div className="reports-trend-bar-wrap">
                            <div
                              className={`reports-trend-bar ${p.total ? '' : 'is-empty'}`}
                              style={{ height: `${h}%` }}
                              title={`${p.label}: ${p.total}`}
                            />
                          </div>
                          <span className="reports-trend-value">{p.total}</span>
                          <span className="reports-trend-label">{p.label.split(' ')[0]}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <section className="panel dash-panel">
              <div className="dash-panel-head">
                <h2>
                  <Building2
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden
                    style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }}
                  />
                  By campus
                </h2>
                <span className="muted">{hasFilters ? 'Filtered' : 'All recorded meals'}</span>
              </div>
              {campusRows.length === 0 ? (
                <p className="muted reports-empty-line">No campus breakdown yet.</p>
              ) : (
                <ul className="profile-bars">
                  {campusRows.map((row) => {
                    const name = row.campus?.shortName || row.campus?.name || 'Campus';
                    const pct = Math.max(8, Math.round((row.count / campusMax) * 100));
                    return (
                      <li key={row.campus?.id ?? name}>
                        <div className="profile-bar-label">
                          <strong>{name}</strong>
                          <span>{row.count}</span>
                        </div>
                        <div className="profile-bar-track">
                          <span style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="panel dash-panel">
              <div className="dash-panel-head">
                <h2>
                  <UtensilsCrossed
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden
                    style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }}
                  />
                  Recent serves
                </h2>
                <span className="muted">
                  <CalendarDays
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden
                    style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }}
                  />
                  Latest 12
                </span>
              </div>
              {recent.length === 0 ? (
                <p className="muted reports-empty-line">No recent meals.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Student</th>
                        <th>Meal</th>
                        <th>Campus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((m) => (
                        <tr key={m.id}>
                          <td className="muted">{formatWhen(m.servedAt)}</td>
                          <td>
                            <div className="reports-student">
                              <strong>{m.studentName}</strong>
                              <span className="muted">{m.studentId}</span>
                            </div>
                          </td>
                          <td>{sessionLabel(m.mealCode)}</td>
                          <td>{m.campus}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
