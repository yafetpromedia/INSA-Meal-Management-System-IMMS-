'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Clock3, UtensilsCrossed, Hash } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { StatusChip } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, getActiveOrganizationId } from '@/lib/api';
import { APP_TIMEZONE, APP_TIMEZONE_LABEL } from '@/lib/timezone';

type MealProfile = {
  student: {
    id: string;
    studentId: string;
    barcode: string;
    fullName: string;
    department?: string | null;
    status: string;
    campus?: { shortName: string; name: string } | null;
    program?: { name: string } | null;
    academicYear?: { name: string } | null;
  };
  summary: {
    totalMeals: number;
    daysEaten: number;
    weeksActive: number;
    bySession: Record<string, number>;
    byWeekday: Record<string, number>;
    firstMealAt: string | null;
    lastMealAt: string | null;
  };
  byWeek: Array<{
    key: string;
    weekNumber: number;
    year: number;
    meals: number;
    daysEaten: number;
  }>;
  meals: Array<{
    id: string;
    mealCode: string;
    mealDate: string;
    servedAt: string;
    weekNumber?: number | null;
    dayOfWeek?: string | null;
    status: string;
    location?: string | null;
    mentor?: { fullName: string } | null;
    campus?: { shortName: string; name: string } | null;
  }>;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    timeZone: APP_TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  return `${formatDate(value)} · ${formatTime(value)} ${APP_TIMEZONE_LABEL}`;
}

const WEEKDAY_ORDER = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export default function StudentMealProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const studentKey = params?.id ?? '';

  const [profile, setProfile] = useState<MealProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    if (!studentKey) return;

    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    setLoading(true);
    api<MealProfile>(`/meals/profile/${encodeURIComponent(studentKey)}${q}`)
      .then((data) => setProfile(data))
      .catch((err: Error) => setError(err.message || 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [router, studentKey]);

  const sessionRows = useMemo(() => {
    if (!profile) return [];
    return Object.entries(profile.summary.bySession).sort((a, b) => b[1] - a[1]);
  }, [profile]);

  const weekdayRows = useMemo(() => {
    if (!profile) return [];
    return WEEKDAY_ORDER.filter((d) => profile.summary.byWeekday[d]).map((d) => [
      d,
      profile.summary.byWeekday[d]!,
    ]) as Array<[string, number]>;
  }, [profile]);

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <Link href="/students" className="profile-back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Students
          </Link>
          <h1 className="page-title">Student meal profile</h1>
          <p className="page-sub">Days eaten, sessions, weeks, and exact serve times (EAT).</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => router.push('/students')}>
          Back
        </Button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 12 }}>
          <Skeleton height={48} />
          <Skeleton height={120} />
          <Skeleton height={220} />
        </div>
      ) : !profile ? (
        <EmptyState title="Student not found" actionLabel="Back to students" onAction={() => router.push('/students')} />
      ) : (
        <div className="profile-page">
          <section className="panel profile-hero">
            <div className="profile-hero-main">
              <div className="profile-avatar" aria-hidden>
                {profile.student.fullName
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </div>
              <div>
                <h2>{profile.student.fullName}</h2>
                <p className="muted">
                  {profile.student.studentId}
                  <span aria-hidden> · </span>
                  {profile.student.barcode}
                </p>
                <div className="meal-chips" style={{ marginTop: 10 }}>
                  <StatusChip tone={profile.student.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {profile.student.status}
                  </StatusChip>
                  <StatusChip tone="info">
                    {profile.student.campus?.shortName ?? profile.student.campus?.name ?? 'Campus'}
                  </StatusChip>
                  <StatusChip tone="info">{profile.student.program?.name ?? 'Program'}</StatusChip>
                  {profile.student.department ? (
                    <StatusChip tone="neutral">{profile.student.department}</StatusChip>
                  ) : null}
                  {profile.student.academicYear ? (
                    <StatusChip tone="neutral">{profile.student.academicYear.name}</StatusChip>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="profile-hero-meta muted">
              <div>
                <span>First meal</span>
                <strong>{formatDateTime(profile.summary.firstMealAt)}</strong>
              </div>
              <div>
                <span>Last meal</span>
                <strong>{formatDateTime(profile.summary.lastMealAt)}</strong>
              </div>
            </div>
          </section>

          <section className="profile-stats">
            <div className="panel profile-stat">
              <UtensilsCrossed size={18} strokeWidth={1.75} aria-hidden />
              <div>
                <span className="muted">Total meals</span>
                <strong>{profile.summary.totalMeals}</strong>
              </div>
            </div>
            <div className="panel profile-stat">
              <CalendarDays size={18} strokeWidth={1.75} aria-hidden />
              <div>
                <span className="muted">Days eaten</span>
                <strong>{profile.summary.daysEaten}</strong>
              </div>
            </div>
            <div className="panel profile-stat">
              <Hash size={18} strokeWidth={1.75} aria-hidden />
              <div>
                <span className="muted">Weeks active</span>
                <strong>{profile.summary.weeksActive}</strong>
              </div>
            </div>
            <div className="panel profile-stat">
              <Clock3 size={18} strokeWidth={1.75} aria-hidden />
              <div>
                <span className="muted">Sessions</span>
                <strong>{sessionRows.length}</strong>
              </div>
            </div>
          </section>

          <div className="profile-grid">
            <section className="panel">
              <h3 className="profile-section-title">By meal session</h3>
              {sessionRows.length === 0 ? (
                <p className="muted">No meals yet.</p>
              ) : (
                <ul className="profile-bars">
                  {sessionRows.map(([code, count]) => {
                    const max = sessionRows[0]?.[1] || 1;
                    const pct = Math.max(8, Math.round((count / max) * 100));
                    return (
                      <li key={code}>
                        <div className="profile-bar-label">
                          <strong>{code}</strong>
                          <span>{count}</span>
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

            <section className="panel">
              <h3 className="profile-section-title">By weekday</h3>
              {weekdayRows.length === 0 ? (
                <p className="muted">No weekday data yet.</p>
              ) : (
                <ul className="profile-bars">
                  {weekdayRows.map(([day, count]) => {
                    const max = Math.max(...weekdayRows.map(([, n]) => n), 1);
                    const pct = Math.max(8, Math.round((count / max) * 100));
                    return (
                      <li key={day}>
                        <div className="profile-bar-label">
                          <strong>{day}</strong>
                          <span>{count}</span>
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
          </div>

          <section className="panel">
            <h3 className="profile-section-title">By week</h3>
            {profile.byWeek.length === 0 ? (
              <p className="muted">No weekly history yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table zebra">
                  <thead>
                    <tr>
                      <th>Week</th>
                      <th>Year</th>
                      <th>Days eaten</th>
                      <th>Meals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.byWeek.map((w) => (
                      <tr key={w.key}>
                        <td>Week {w.weekNumber || '—'}</td>
                        <td>{w.year}</td>
                        <td>{w.daysEaten}</td>
                        <td>{w.meals}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <h3 className="profile-section-title">Meal timeline</h3>
            <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: '0.8125rem' }}>
              Each serve with date, clock time ({APP_TIMEZONE_LABEL}), session, and week.
            </p>
            {profile.meals.length === 0 ? (
              <EmptyState title="No meals recorded for this student" />
            ) : (
              <div className="table-wrap">
                <table className="table zebra">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Session</th>
                      <th>Weekday</th>
                      <th>Week</th>
                      <th>Served by</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.meals.map((m, index) => (
                      <tr key={m.id}>
                        <td className="muted">{profile.meals.length - index}</td>
                        <td>{formatDate(m.mealDate)}</td>
                        <td>
                          {formatTime(m.servedAt)}{' '}
                          <span className="muted">{APP_TIMEZONE_LABEL}</span>
                        </td>
                        <td>
                          <StatusChip tone="info">{m.mealCode}</StatusChip>
                        </td>
                        <td>{m.dayOfWeek ?? '—'}</td>
                        <td>{m.weekNumber != null ? `W${m.weekNumber}` : '—'}</td>
                        <td>{m.mentor?.fullName ?? '—'}</td>
                        <td>
                          <StatusChip tone={m.status === 'SERVED' ? 'success' : 'warning'}>
                            {m.status}
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
      )}
    </AppShell>
  );
}
