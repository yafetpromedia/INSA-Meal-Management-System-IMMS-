'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { api, getActiveOrganizationId } from '@/lib/api';

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

export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [activity, setActivity] = useState<unknown[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    Promise.all([
      api<Summary>(`/dashboard/summary${q}`),
      api<unknown[]>(`/dashboard/activity${q}`),
    ])
      .then(([s, a]) => {
        setSummary(s);
        setActivity(a);
      })
      .catch((err: Error) => setError(err.message));
  }, [router]);

  const cards = summary
    ? [
        ['Total Students', summary.totalStudents],
        ['Breakfast', summary.breakfastServed],
        ['Lunch', summary.lunchServed],
        ['Dinner', summary.dinnerServed],
        ['Meals Today', summary.mealsServedToday],
        ['Duplicate Scans', summary.duplicateScanAttempts],
        ['Active Staff', summary.activeStaff],
      ]
    : [];

  return (
    <AppShell>
      <h1 className="page-title">Meal Dashboard</h1>
      <p className="page-sub">
        Live meal distribution overview
        {summary?.currentAcademicYear ? ` · Year ${summary.currentAcademicYear}` : ''}
        {summary?.currentMealSession ? ` · Current meal: ${summary.currentMealSession}` : ''}
      </p>
      {error ? <p className="error">{error}</p> : null}
      <div className="grid" style={{ marginBottom: '1.5rem' }}>
        {cards.map(([label, value]) => (
          <div className="stat" key={String(label)}>
            <span className="muted">{label}</span>
            <strong>{value as number}</strong>
          </div>
        ))}
      </div>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Meal activity</h2>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.85rem' }}>
          {JSON.stringify(activity, null, 2)}
        </pre>
      </div>
    </AppShell>
  );
}
