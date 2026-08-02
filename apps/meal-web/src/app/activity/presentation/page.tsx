'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { api, apiBlob, apiWithMeta, getActiveOrganizationId } from '@/lib/api';
import {
  formatActivityDate,
  type ActivityReport,
  type ActivitySummary,
} from '@/lib/activity';

type Slide = {
  report: ActivityReport;
  imageUrl?: string;
  caption?: string;
};

export default function ActivityPresentationPage() {
  const router = useRouter();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }
    const orgId = getActiveOrganizationId();
    const qs = new URLSearchParams({
      page: '1',
      limit: '40',
      status: 'APPROVED',
      ...(orgId ? { organizationId: orgId } : {}),
    });
    const summaryQs = orgId ? `?organizationId=${orgId}` : '';
    setLoading(true);
    Promise.all([
      apiWithMeta<ActivityReport[]>(`/activity-reports?${qs}`),
      apiWithMeta<ActivityReport[]>(
        `/activity-reports?${new URLSearchParams({
          ...Object.fromEntries(qs),
          status: 'PUBLISHED',
        })}`,
      ),
      api<ActivitySummary>(`/activity-reports/summary${summaryQs}`).catch(() => null),
    ])
      .then(async ([approved, published, sum]) => {
        setSummary(sum);
        const map = new Map<string, ActivityReport>();
        for (const r of [...(approved.data ?? []), ...(published.data ?? [])]) {
          map.set(r.id, r);
        }
        const reports = Array.from(map.values()).sort((a, b) =>
          String(b.reportDate).localeCompare(String(a.reportDate)),
        );
        const built: Slide[] = [];
        for (const report of reports) {
          const detail = await api<ActivityReport>(`/activity-reports/${report.id}`).catch(
            () => report,
          );
          const images = (detail.media ?? []).filter((m) => m.fileType === 'image');
          if (!images.length) {
            built.push({ report: detail });
            continue;
          }
          for (const img of images.slice(0, 3)) {
            try {
              const blob = await apiBlob(`/activity-reports/media/${img.id}/file`);
              built.push({
                report: detail,
                imageUrl: URL.createObjectURL(blob),
                caption: img.caption || detail.title,
              });
            } catch {
              built.push({ report: detail });
            }
          }
        }
        setSlides(built);
        setIndex(0);
      })
      .finally(() => setLoading(false));

    return () => {
      setSlides((prev) => {
        for (const s of prev) if (s.imageUrl) URL.revokeObjectURL(s.imageUrl);
        return prev;
      });
    };
  }, [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(slides.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'Escape') setFullscreen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length]);

  const slide = slides[index];
  const stats = useMemo(
    () =>
      summary
        ? [
            { label: 'Activities today', value: summary.activitiesToday },
            { label: 'Pending approvals', value: summary.pendingApprovals },
            { label: 'Approved reports', value: summary.approvedReports },
            { label: 'Photos today', value: summary.photosToday },
            { label: 'Weekly activities', value: summary.weeklyActivityCount },
            { label: 'Active campuses', value: summary.activeCampusesToday },
          ]
        : [],
    [summary],
  );

  const body = (
    <div className={`activity-present ${fullscreen ? 'is-fullscreen' : ''}`}>
      {!fullscreen ? (
        <div className="page-head">
          <div>
            <Link href="/activity" className="profile-back">
              <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
              Activity reports
            </Link>
            <h1 className="page-title">Presentation mode</h1>
            <p className="page-sub">
              Large photos and report summaries for IMMS leadership briefings.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => setFullscreen(true)}>
            <Maximize2 size={15} strokeWidth={1.75} aria-hidden />
            Full screen
          </Button>
        </div>
      ) : null}

      {stats.length ? (
        <section className="dash-stats" aria-label="Presentation stats" style={{ marginBottom: 12 }}>
          {stats.map((card) => (
            <div className="dash-stat" key={card.label}>
              <span className="dash-stat-label">{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </section>
      ) : null}

      {loading ? (
        <Skeleton height={420} />
      ) : !slide ? (
        <EmptyState
          title="Nothing to present"
          description="Approve or publish activity reports with photos first."
          actionLabel="Back to reports"
          onAction={() => router.push('/activity')}
        />
      ) : (
        <section className="activity-present-stage panel">
          {slide.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slide.imageUrl} alt={slide.caption || slide.report.title} />
          ) : (
            <div className="activity-present-placeholder">No photo for this report</div>
          )}
          <div className="activity-present-caption">
            <h2>{slide.report.title}</h2>
            <p>
              {slide.report.campus?.shortName ?? slide.report.campus?.name} ·{' '}
              {formatActivityDate(slide.report.reportDate)} · {slide.report.category?.name}
            </p>
            <p className="muted">{slide.report.description.slice(0, 220)}</p>
            <p className="muted">
              Slide {index + 1} of {slides.length} · Use ← → keys
            </p>
          </div>
          <div className="activity-present-nav">
            <Button
              type="button"
              variant="secondary"
              disabled={index <= 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
              Prev
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={index >= slides.length - 1}
              onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
            >
              Next
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
            </Button>
            {fullscreen ? (
              <Button type="button" variant="ghost" onClick={() => setFullscreen(false)}>
                Exit
              </Button>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );

  if (fullscreen) return body;
  return <AppShell>{body}</AppShell>;
}
