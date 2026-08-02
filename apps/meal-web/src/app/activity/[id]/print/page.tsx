'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ActivityReportDocument } from '@/components/activity/ActivityReportDocument';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import type { ActivityReport } from '@/lib/activity';

/** Clean printable / PDF-ready activity report (no app chrome). */
export default function ActivityReportPrintPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [report, setReport] = useState<ActivityReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }
    if (!id) return;
    api<ActivityReport>(`/activity-reports/${id}`)
      .then(setReport)
      .catch((err: Error) => setError(err.message || 'Failed to load'));
  }, [id, router]);

  useEffect(() => {
    if (!report) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [report]);

  if (error) {
    return (
      <main className="art-print-page">
        <p className="error">{error}</p>
        <Button type="button" onClick={() => router.push(`/activity/${id}`)}>
          Back
        </Button>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="art-print-page">
        <p className="muted">Preparing report…</p>
      </main>
    );
  }

  return (
    <main className="art-print-page">
      <div className="art-print-toolbar no-print">
        <Button type="button" variant="secondary" onClick={() => router.push(`/activity/${id}`)}>
          Back to report
        </Button>
        <Button type="button" onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      </div>
      <ActivityReportDocument report={report} />
    </main>
  );
}
