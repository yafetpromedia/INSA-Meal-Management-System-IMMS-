'use client';

import { useRouter } from 'next/navigation';
import {
  ActivityReportBlankForm,
  downloadBlankActivityWordTemplate,
} from '@/components/activity/ActivityReportBlankTemplate';
import { Button } from '@/components/ui/Button';

/** Blank activity report — print / PDF or download Word. */
export default function ActivityBlankTemplatePage() {
  const router = useRouter();

  return (
    <main className="art-print-page">
      <div className="art-print-toolbar no-print">
        <Button type="button" variant="secondary" onClick={() => router.push('/activity')}>
          Back to reports
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => downloadBlankActivityWordTemplate()}
        >
          Download Word
        </Button>
        <Button type="button" onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      </div>
      <ActivityReportBlankForm />
    </main>
  );
}
