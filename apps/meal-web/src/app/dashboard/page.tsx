'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  ClipboardPen,
  Coffee,
  Gavel,
  Moon,
  RefreshCw,
  Sun,
  UtensilsCrossed,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import {
  CoverageDonut,
  MealSessionsChart,
  ModuleBarsChart,
} from '@/components/dashboard/DashCharts';
import { StatusChip } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { api, getActiveOrganizationId } from '@/lib/api';
import {
  canViewActivitySummary,
  canViewDisciplinarySummary,
  canViewLeaveSummary,
  homePathForRole,
  readStoredUser,
} from '@/lib/rbac';
import { formatEthiopiaTime } from '@/lib/timezone';
import type { LeaveSummary } from '@/lib/leave';
import type { DisciplinarySummary } from '@/lib/disciplinary';
import type { ActivitySummary } from '@/lib/activity';

type Summary = {
  totalStudents: number;
  breakfastServed: number;
  lunchServed: number;
  dinnerServed: number;
  mealsServedToday: number;
  duplicateScanAttempts: number;
  activeStaff: number;
  currentMealSession: string | null;
  currentAcademicYear: string | null;
};

type ActivityItem = {
  id?: string;
  action?: string;
  resource?: string;
  resourceId?: string | null;
  timestamp?: string;
  user?: { fullName?: string };
};

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function sessionIcon(code: string | null) {
  const c = (code ?? '').toUpperCase();
  if (c.includes('BREAKFAST')) return Coffee;
  if (c.includes('DINNER')) return Moon;
  return Sun;
}

function activityLabel(action?: string) {
  switch (action) {
    case 'Meal.Serve':
      return 'Meal served';
    case 'Meal.Override':
      return 'Meal override';
    case 'Meal.DuplicatePrevented':
      return 'Duplicate blocked';
    case 'Meal.SessionUpsert':
    case 'Meal.SessionUpdate':
      return 'Session updated';
    default:
      return action?.replace(/\./g, ' · ') ?? 'Event';
  }
}

function activityChip(action?: string) {
  switch (action) {
    case 'Meal.Serve':
      return { tone: 'success' as const, label: 'Served' };
    case 'Meal.Override':
      return { tone: 'info' as const, label: 'Override' };
    case 'Meal.DuplicatePrevented':
      return { tone: 'warning' as const, label: 'Duplicate' };
    default:
      return { tone: 'info' as const, label: 'Update' };
  }
}

function Kpi({
  label,
  value,
  hint,
  warn,
  onClick,
}: {
  label: string;
  value: number;
  hint?: string;
  warn?: boolean;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <div
      className={`dash-kpi ${warn ? 'is-warn' : ''} ${interactive ? 'is-click' : ''}`}
      role={interactive ? 'link' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <span className="dash-kpi-label">{label}</span>
      <strong>{value}</strong>
      {hint ? <span className="muted dash-kpi-hint">{hint}</span> : null}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof readStoredUser>>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [leaveSummary, setLeaveSummary] = useState<LeaveSummary | null>(null);
  const [disciplinarySummary, setDisciplinarySummary] =
    useState<DisciplinarySummary | null>(null);
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clock, setClock] = useState('');
  const [hour, setHour] = useState(12);
  const [mounted, setMounted] = useState(false);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError('');
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    const currentUser = readStoredUser();
    const showLeave = canViewLeaveSummary(currentUser);
    const showDisciplinary = canViewDisciplinarySummary(currentUser);
    const showActivity = canViewActivitySummary(currentUser);
    try {
      const [s, a] = await Promise.all([
        api<Summary>(`/dashboard/summary${q}`),
        api<ActivityItem[]>(`/dashboard/activity${q}`),
      ]);
      setSummary(s);
      setActivity(Array.isArray(a) ? a : []);
      if (showLeave) {
        try {
          setLeaveSummary(await api<LeaveSummary>(`/leave-requests/summary${q}`));
        } catch {
          setLeaveSummary(null);
        }
      } else setLeaveSummary(null);

      if (showDisciplinary) {
        try {
          setDisciplinarySummary(
            await api<DisciplinarySummary>(`/disciplinary-incidents/summary${q}`),
          );
        } catch {
          setDisciplinarySummary(null);
        }
      } else setDisciplinarySummary(null);

      if (showActivity) {
        try {
          setActivitySummary(await api<ActivitySummary>(`/activity-reports/summary${q}`));
        } catch {
          setActivitySummary(null);
        }
      } else setActivitySummary(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setUser(readStoredUser());
    setMounted(true);
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    void load();
    const poll = window.setInterval(() => void load(true), 30000);
    return () => window.clearInterval(poll);
  }, [router, load]);

  useEffect(() => {
    const tick = () => {
      setClock(formatEthiopiaTime());
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Addis_Ababa',
        hour: '2-digit',
        hour12: false,
      }).formatToParts(new Date());
      setHour(Number(parts.find((p) => p.type === 'hour')?.value ?? 12) % 24);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const SessionIcon = sessionIcon(summary?.currentMealSession ?? null);
  const firstName = mounted ? (user?.fullName?.split(' ')[0] ?? 'there') : 'there';
  const greeting = mounted ? greetingForHour(hour) : 'Welcome';
  const live = Boolean(summary?.currentMealSession);

  const currentServed = useMemo(() => {
    if (!summary?.currentMealSession) return 0;
    const code = summary.currentMealSession.toUpperCase();
    if (code.includes('BREAKFAST')) return summary.breakfastServed;
    if (code.includes('LUNCH')) return summary.lunchServed;
    if (code.includes('DINNER')) return summary.dinnerServed;
    return summary.mealsServedToday;
  }, [summary]);

  const remaining = Math.max(0, (summary?.totalStudents ?? 0) - currentServed);

  const sessionChart = useMemo(() => {
    if (!summary) return [];
    const code = (summary.currentMealSession ?? '').toUpperCase();
    return [
      {
        name: 'Breakfast',
        served: summary.breakfastServed,
        active: code.includes('BREAKFAST'),
      },
      {
        name: 'Lunch',
        served: summary.lunchServed,
        active: code.includes('LUNCH'),
      },
      {
        name: 'Dinner',
        served: summary.dinnerServed,
        active: code.includes('DINNER'),
      },
    ];
  }, [summary]);

  const moduleChart = useMemo(() => {
    const rows: Array<{ name: string; value: number }> = [];
    if (leaveSummary) {
      rows.push({ name: 'Outside', value: leaveSummary.outside });
      rows.push({ name: 'Leave pending', value: leaveSummary.pending });
      rows.push({ name: 'Overdue', value: leaveSummary.overdue });
    }
    if (disciplinarySummary) {
      rows.push({ name: 'Open cases', value: disciplinarySummary.openCases });
      rows.push({ name: 'Incidents today', value: disciplinarySummary.incidentsToday });
    }
    if (activitySummary) {
      rows.push({ name: 'Activities', value: activitySummary.activitiesToday });
      rows.push({ name: 'Pending reports', value: activitySummary.pendingApprovals });
    }
    return rows.filter((r) => r.value > 0 || rows.length <= 4).slice(0, 7);
  }, [leaveSummary, disciplinarySummary, activitySummary]);

  return (
    <AppShell>
      <div className="dash">
        <header className="dash-head">
          <div>
            <p className="dash-kicker" suppressHydrationWarning>
              {greeting}, {firstName}
            </p>
            <h1 className="page-title">Operations dashboard</h1>
            <p className="page-sub dash-sub" suppressHydrationWarning>
              Live overview · {mounted && clock ? clock : 'local time'}
              {summary?.currentAcademicYear ? ` · ${summary.currentAcademicYear}` : ''}
            </p>
          </div>
          <div className="dash-head-actions">
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
            <Button type="button" onClick={() => router.push('/meals')}>
              <UtensilsCrossed size={16} strokeWidth={1.75} aria-hidden />
              Meal station
            </Button>
          </div>
        </header>

        {error ? <p className="error">{error}</p> : null}

        <section className={`dash-hero ${live ? 'is-live' : ''}`} aria-live="polite">
          {loading ? (
            <div style={{ display: 'grid', gap: 10, flex: 1 }}>
              <Skeleton height={14} width={120} />
              <Skeleton height={28} width={180} />
              <Skeleton height={14} width={220} />
            </div>
          ) : (
            <>
              <div className="dash-hero-main">
                <div className="dash-hero-icon" aria-hidden>
                  <SessionIcon size={22} strokeWidth={1.75} />
                </div>
                <div>
                  <div className="dash-hero-label">
                    {live ? 'Current meal session' : 'No active meal window'}
                  </div>
                  <h2>{live ? summary?.currentMealSession : 'Between sessions'}</h2>
                  <p className="muted">
                    {live
                      ? `${currentServed} served · ~${remaining} still expected this window`
                      : 'Open the meal station when the next window starts.'}
                  </p>
                </div>
              </div>
              <div className="dash-hero-metrics">
                <div>
                  <span className="muted">Served now</span>
                  <strong>{currentServed}</strong>
                </div>
                <div>
                  <span className="muted">Remaining</span>
                  <strong>{remaining}</strong>
                </div>
                <div className="dash-hero-side">
                  <StatusChip tone={live ? 'success' : 'warning'}>
                    {live ? 'Live' : 'Idle'}
                  </StatusChip>
                  <button
                    type="button"
                    className="dash-link"
                    onClick={() => router.push('/meals')}
                  >
                    Open station <ArrowRight size={14} strokeWidth={2} aria-hidden />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="dash-kpis" aria-label="Key metrics">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div className="dash-kpi" key={i}>
                  <Skeleton height={12} width="50%" />
                  <Skeleton height={28} width="40%" />
                </div>
              ))
            : (
              <>
                <Kpi
                  label="Meals today"
                  value={summary?.mealsServedToday ?? 0}
                  hint="All sessions"
                />
                <Kpi
                  label="Students"
                  value={summary?.totalStudents ?? 0}
                  hint="On roster"
                />
                <Kpi
                  label="Active staff"
                  value={summary?.activeStaff ?? 0}
                  hint="Mentors & food staff"
                />
                <Kpi
                  label="Duplicates"
                  value={summary?.duplicateScanAttempts ?? 0}
                  hint="Blocked today"
                  warn={(summary?.duplicateScanAttempts ?? 0) > 0}
                />
              </>
            )}
        </section>

        <div className="dash-charts">
          <section className="panel dash-panel">
            <div className="dash-panel-head">
              <div>
                <h2>Meals by session</h2>
                <p className="muted dash-panel-sub">Breakfast, lunch, and dinner today</p>
              </div>
            </div>
            {loading ? (
              <Skeleton height={240} />
            ) : (
              <MealSessionsChart
                data={sessionChart}
                roster={summary?.totalStudents ?? 0}
              />
            )}
          </section>

          <section className="panel dash-panel">
            <div className="dash-panel-head">
              <div>
                <h2>Session coverage</h2>
                <p className="muted dash-panel-sub">
                  {live ? 'Current window vs roster' : 'Today vs roster'}
                </p>
              </div>
            </div>
            {loading ? (
              <Skeleton height={220} />
            ) : (
              <CoverageDonut
                served={live ? currentServed : summary?.mealsServedToday ?? 0}
                remaining={
                  live
                    ? remaining
                    : Math.max(
                        0,
                        (summary?.totalStudents ?? 0) - (summary?.mealsServedToday ?? 0),
                      )
                }
                label={live ? 'covered' : 'of roster'}
              />
            )}
          </section>
        </div>

        {(leaveSummary || disciplinarySummary || activitySummary) && !loading ? (
          <div className="dash-charts dash-charts-secondary">
            <section className="panel dash-panel">
              <div className="dash-panel-head">
                <div>
                  <h2>Campus pulse</h2>
                  <p className="muted dash-panel-sub">Leave, disciplinary & activity signals</p>
                </div>
              </div>
              {moduleChart.length ? (
                <ModuleBarsChart data={moduleChart} />
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  No module activity to chart yet.
                </p>
              )}
            </section>

            <section className="panel dash-panel dash-modules">
              <div className="dash-panel-head">
                <div>
                  <h2>Quick modules</h2>
                  <p className="muted dash-panel-sub">Jump into what needs attention</p>
                </div>
              </div>
              <div className="dash-module-grid">
                {leaveSummary ? (
                  <button
                    type="button"
                    className="dash-module-card"
                    onClick={() => router.push('/leave/outside')}
                  >
                    <ClipboardPen size={18} strokeWidth={1.75} aria-hidden />
                    <div>
                      <strong>{leaveSummary.outside}</strong>
                      <span>Students outside</span>
                    </div>
                    {leaveSummary.overdue > 0 ? (
                      <StatusChip tone="warning">{leaveSummary.overdue} overdue</StatusChip>
                    ) : (
                      <StatusChip tone="info">{leaveSummary.pending} pending</StatusChip>
                    )}
                  </button>
                ) : null}
                {disciplinarySummary ? (
                  <button
                    type="button"
                    className="dash-module-card"
                    onClick={() => router.push('/disciplinary')}
                  >
                    <Gavel size={18} strokeWidth={1.75} aria-hidden />
                    <div>
                      <strong>{disciplinarySummary.openCases}</strong>
                      <span>Open cases</span>
                    </div>
                    {disciplinarySummary.highSeverityOpen > 0 ? (
                      <StatusChip tone="error">
                        {disciplinarySummary.highSeverityOpen} high
                      </StatusChip>
                    ) : (
                      <StatusChip tone="info">
                        {disciplinarySummary.incidentsToday} today
                      </StatusChip>
                    )}
                  </button>
                ) : null}
                {activitySummary ? (
                  <button
                    type="button"
                    className="dash-module-card"
                    onClick={() => router.push('/activity')}
                  >
                    <Camera size={18} strokeWidth={1.75} aria-hidden />
                    <div>
                      <strong>{activitySummary.activitiesToday}</strong>
                      <span>Activities today</span>
                    </div>
                    {activitySummary.pendingApprovals > 0 ? (
                      <StatusChip tone="warning">
                        {activitySummary.pendingApprovals} pending
                      </StatusChip>
                    ) : (
                      <StatusChip tone="success">
                        {activitySummary.approvedReports} approved
                      </StatusChip>
                    )}
                  </button>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        <section className="panel dash-panel">
          <div className="dash-panel-head">
            <div>
              <h2>Recent activity</h2>
              <p className="muted dash-panel-sub">Latest meal station events</p>
            </div>
            <button
              type="button"
              className="dash-link"
              onClick={() => router.push(homePathForRole(user))}
            >
              Station
            </button>
          </div>
          {loading ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <Skeleton height={48} />
              <Skeleton height={48} />
              <Skeleton height={48} />
            </div>
          ) : activity.length === 0 ? (
            <div className="dash-empty">
              <p className="muted">No serves yet today. Activity appears as meals are scanned.</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => router.push('/meals')}
              >
                Start serving
              </Button>
            </div>
          ) : (
            <ul className="dash-activity">
              {activity.slice(0, 8).map((item, idx) => (
                <li key={item.id ?? idx}>
                  <div>
                    <strong>{activityLabel(item.action)}</strong>
                    <div className="muted">
                      {item.user?.fullName ?? 'System'}
                      {item.resource ? ` · ${item.resource}` : ''}
                    </div>
                  </div>
                  <div className="dash-activity-meta">
                    {(() => {
                      const chip = activityChip(item.action);
                      return (
                        <StatusChip tone={chip.tone}>
                          {chip.tone === 'warning' ? (
                            <>
                              <AlertTriangle size={11} strokeWidth={2} aria-hidden />{' '}
                              {chip.label}
                            </>
                          ) : (
                            chip.label
                          )}
                        </StatusChip>
                      );
                    })()}
                    <time className="muted">
                      {item.timestamp
                        ? formatEthiopiaTime(new Date(item.timestamp))
                        : ''}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
