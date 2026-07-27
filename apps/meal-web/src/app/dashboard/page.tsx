'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Coffee,
  Moon,
  RefreshCw,
  Sun,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { StatusChip } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { api, getActiveOrganizationId } from '@/lib/api';
import { homePathForRole, readStoredUser } from '@/lib/rbac';
import { formatEthiopiaTime } from '@/lib/timezone';

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

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof readStoredUser>>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
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
    try {
      const [s, a] = await Promise.all([
        api<Summary>(`/dashboard/summary${q}`),
        api<ActivityItem[]>(`/dashboard/activity${q}`),
      ]);
      setSummary(s);
      setActivity(Array.isArray(a) ? a : []);
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
  // Keep SSR/client first paint identical — personalize only after mount
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

  const sessions = summary
    ? [
        { key: 'Breakfast', value: summary.breakfastServed, active: (summary.currentMealSession ?? '').toUpperCase().includes('BREAKFAST') },
        { key: 'Lunch', value: summary.lunchServed, active: (summary.currentMealSession ?? '').toUpperCase().includes('LUNCH') },
        { key: 'Dinner', value: summary.dinnerServed, active: (summary.currentMealSession ?? '').toUpperCase().includes('DINNER') },
      ]
    : [];

  return (
    <AppShell>
      <div className="dash">
        <header className="dash-head">
          <div>
            <p className="dash-kicker" suppressHydrationWarning>
              {greeting}, {firstName}
            </p>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-sub dash-sub" suppressHydrationWarning>
              Live meal operations · {mounted && clock ? clock : 'local time'}
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
              <RefreshCw size={15} strokeWidth={1.75} aria-hidden className={refreshing ? 'spin' : undefined} />
              Refresh
            </Button>
            <Button type="button" onClick={() => router.push('/meals')}>
              <UtensilsCrossed size={16} strokeWidth={1.75} aria-hidden />
              Meal station
            </Button>
          </div>
        </header>

        {error ? <p className="error">{error}</p> : null}

        <section className={`dash-session ${live ? 'is-live' : ''}`} aria-live="polite">
          {loading ? (
            <div style={{ display: 'grid', gap: 10, flex: 1 }}>
              <Skeleton height={14} width={120} />
              <Skeleton height={28} width={180} />
              <Skeleton height={14} width={220} />
            </div>
          ) : (
            <>
              <div className="dash-session-main">
                <div className="dash-session-icon" aria-hidden>
                  <SessionIcon size={22} strokeWidth={1.75} />
                </div>
                <div>
                  <div className="dash-session-label">
                    {live ? 'Current meal session' : 'No active meal window'}
                  </div>
                  <h2>{live ? summary?.currentMealSession : 'Between sessions'}</h2>
                  <p className="muted">
                    {live
                      ? `${currentServed} served · ~${remaining} still on roster for this window`
                      : 'Open the meal station when the next window starts.'}
                  </p>
                </div>
              </div>
              <div className="dash-session-side">
                <StatusChip tone={live ? 'success' : 'warning'}>{live ? 'Live' : 'Idle'}</StatusChip>
                <button type="button" className="dash-link" onClick={() => router.push('/meals')}>
                  Open station <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </button>
              </div>
            </>
          )}
        </section>

        <section className="dash-stats" aria-label="Today overview">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div className="dash-stat" key={i}>
                  <Skeleton height={12} width="50%" />
                  <Skeleton height={28} width="40%" />
                </div>
              ))
            : [
                {
                  label: 'Meals today',
                  value: summary?.mealsServedToday ?? 0,
                  hint: 'All sessions',
                },
                {
                  label: 'Duplicates blocked',
                  value: summary?.duplicateScanAttempts ?? 0,
                  hint: 'Today',
                  warn: (summary?.duplicateScanAttempts ?? 0) > 0,
                },
                {
                  label: 'Active staff',
                  value: summary?.activeStaff ?? 0,
                  hint: 'Mentors & food staff',
                },
                {
                  label: 'Students',
                  value: summary?.totalStudents ?? 0,
                  hint: 'On roster',
                },
              ].map((card) => (
                <div className={`dash-stat ${card.warn ? 'is-warn' : ''}`} key={card.label}>
                  <span className="dash-stat-label">{card.label}</span>
                  <strong>{card.value}</strong>
                  <span className="muted dash-stat-hint">{card.hint}</span>
                </div>
              ))}
        </section>

        <div className="dash-grid">
          <section className="panel dash-panel">
            <div className="dash-panel-head">
              <h2>Today by session</h2>
              <Users size={15} strokeWidth={1.75} className="muted" aria-hidden />
            </div>
            {loading ? (
              <div style={{ display: 'grid', gap: 14 }}>
                <Skeleton height={44} />
                <Skeleton height={44} />
                <Skeleton height={44} />
              </div>
            ) : (
              <div className="dash-sessions">
                {sessions.map((s) => (
                  <div key={s.key} className={`dash-session-row ${s.active ? 'is-active' : ''}`}>
                    <div className="dash-session-row-top">
                      <span>
                        {s.key}
                        {s.active ? <StatusChip tone="success">Now</StatusChip> : null}
                      </span>
                      <strong>{s.value}</strong>
                    </div>
                    <div className="dash-bar" aria-hidden>
                      <span style={{ width: `${pct(s.value, summary?.totalStudents ?? 0)}%` }} />
                    </div>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      {pct(s.value, summary?.totalStudents ?? 0)}% of roster
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel dash-panel">
            <div className="dash-panel-head">
              <h2>Recent activity</h2>
              <button type="button" className="dash-link" onClick={() => router.push(homePathForRole(user))}>
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
                <Button type="button" variant="secondary" size="sm" onClick={() => router.push('/meals')}>
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
                                <AlertTriangle size={11} strokeWidth={2} aria-hidden /> {chip.label}
                              </>
                            ) : (
                              chip.label
                            )}
                          </StatusChip>
                        );
                      })()}
                      <time className="muted">
                        {item.timestamp ? formatEthiopiaTime(new Date(item.timestamp)) : ''}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
