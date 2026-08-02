'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/providers/ToastProvider';
import { api, getActiveOrganizationId } from '@/lib/api';
import { type ActivityCategory, type ActivityReport } from '@/lib/activity';

type Option = { id: string; name: string; shortName?: string | null };

export default function EditActivityReportPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { push } = useToast();
  const id = params?.id ?? '';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaveNote, setAutoSaveNote] = useState('');
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [campuses, setCampuses] = useState<Option[]>([]);
  const [programs, setPrograms] = useState<Option[]>([]);
  const [years, setYears] = useState<Option[]>([]);
  const [form, setForm] = useState({
    title: '',
    categoryId: '',
    campusId: '',
    programId: '',
    academicYearId: '',
    reportDate: '',
    startTime: '',
    endTime: '',
    location: '',
    objectives: '',
    description: '',
    activitiesPerformed: '',
    outcomes: '',
    challenges: '',
    recommendations: '',
    participantCount: '0',
  });
  const dirty = useRef(false);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }
    if (!id) return;
    const orgId = getActiveOrganizationId();
    const qs = orgId ? `?organizationId=${orgId}` : '';
    setLoading(true);
    Promise.all([
      api<ActivityReport>(`/activity-reports/${id}`),
      api<{
        categories: ActivityCategory[];
        campuses: Option[];
        programs: Option[];
        academicYears: Option[];
      }>(`/activity-reports/form-options${qs}`),
    ])
      .then(([report, options]) => {
        if (report.status !== 'DRAFT' && report.status !== 'REJECTED') {
          push({
            kind: 'warning',
            title: 'Not editable',
            message: 'Only draft or rejected reports can be edited.',
          });
          router.replace(`/activity/${id}`);
          return;
        }
        setCategories(Array.isArray(options.categories) ? options.categories : []);
        setCampuses(Array.isArray(options.campuses) ? options.campuses : []);
        setPrograms(Array.isArray(options.programs) ? options.programs : []);
        setYears(Array.isArray(options.academicYears) ? options.academicYears : []);
        setForm({
          title: report.title ?? '',
          categoryId: report.categoryId,
          campusId: report.campusId,
          programId: report.programId ?? '',
          academicYearId: report.academicYearId,
          reportDate: String(report.reportDate).slice(0, 10),
          startTime: report.startTime ?? '',
          endTime: report.endTime ?? '',
          location: report.location ?? '',
          objectives: report.objectives ?? '',
          description: report.description ?? '',
          activitiesPerformed: report.activitiesPerformed ?? '',
          outcomes: report.outcomes ?? '',
          challenges: report.challenges ?? '',
          recommendations: report.recommendations ?? '',
          participantCount: String(report.participantCount ?? 0),
        });
      })
      .catch((err: Error) => {
        push({ kind: 'error', title: 'Failed to load report', message: err.message });
        router.replace('/activity');
      })
      .finally(() => setLoading(false));
  }, [id, router, push]);

  function payload() {
    return {
      title: form.title.trim(),
      categoryId: form.categoryId,
      campusId: form.campusId,
      programId: form.programId || null,
      academicYearId: form.academicYearId,
      reportDate: form.reportDate,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      location: form.location || undefined,
      objectives: form.objectives || undefined,
      description: form.description.trim(),
      activitiesPerformed: form.activitiesPerformed || undefined,
      outcomes: form.outcomes || undefined,
      challenges: form.challenges || undefined,
      recommendations: form.recommendations || undefined,
      participantCount: Number(form.participantCount) || 0,
    };
  }

  async function save(silent = false) {
    if (!form.title.trim() || form.description.trim().length < 5) return;
    setSaving(true);
    try {
      await api<ActivityReport>(`/activity-reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload()),
      });
      dirty.current = false;
      setAutoSaveNote(`Saved ${new Date().toLocaleTimeString()}`);
      if (!silent) {
        push({ kind: 'success', title: 'Report updated' });
        router.push(`/activity/${id}`);
      }
    } catch (err) {
      if (!silent) {
        push({
          kind: 'error',
          title: 'Save failed',
          message: err instanceof Error ? err.message : 'Try again',
        });
      }
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty.current || loading) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void save(true);
    }, 1800);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, loading]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    dirty.current = true;
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await save(false);
  }

  if (loading) {
    return (
      <AppShell>
        <div className="panel" style={{ display: 'grid', gap: 12 }}>
          <Skeleton height={40} />
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <Link href={`/activity/${id}`} className="profile-back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Back to report
          </Link>
          <h1 className="page-title">Edit activity report</h1>
          <p className="page-sub">
            Changes auto-save while you work.{' '}
            {autoSaveNote ? <span className="muted">{autoSaveNote}</span> : null}
          </p>
        </div>
      </div>

      <form className="panel form-grid" onSubmit={onSubmit} style={{ gap: 14 }}>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span>Title</span>
          <Input required value={form.title} onChange={(e) => update('title', e.target.value)} />
        </label>
        <label className="field">
          <span>Category</span>
          <select
            className="select"
            required
            value={form.categoryId}
            onChange={(e) => update('categoryId', e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Campus</span>
          <select
            className="select"
            required
            value={form.campusId}
            onChange={(e) => update('campusId', e.target.value)}
          >
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.shortName ?? c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Program</span>
          <select
            className="select"
            value={form.programId}
            onChange={(e) => update('programId', e.target.value)}
          >
            <option value="">Optional</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Academic year</span>
          <select
            className="select"
            required
            value={form.academicYearId}
            onChange={(e) => update('academicYearId', e.target.value)}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Date</span>
          <Input
            type="date"
            required
            value={form.reportDate}
            onChange={(e) => update('reportDate', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Start</span>
          <Input
            type="time"
            value={form.startTime}
            onChange={(e) => update('startTime', e.target.value)}
          />
        </label>
        <label className="field">
          <span>End</span>
          <Input
            type="time"
            value={form.endTime}
            onChange={(e) => update('endTime', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Location</span>
          <Input value={form.location} onChange={(e) => update('location', e.target.value)} />
        </label>
        <label className="field">
          <span>Participants</span>
          <Input
            type="number"
            min={0}
            value={form.participantCount}
            onChange={(e) => update('participantCount', e.target.value)}
          />
        </label>
        {(
          [
            ['objectives', 'Objectives'],
            ['description', 'Description'],
            ['activitiesPerformed', 'Activities performed'],
            ['outcomes', 'Outcomes'],
            ['challenges', 'Challenges'],
            ['recommendations', 'Recommendations'],
          ] as const
        ).map(([key, label]) => (
          <label className="field" key={key} style={{ gridColumn: '1 / -1' }}>
            <span>{label}</span>
            <textarea
              className="textarea"
              rows={key === 'description' ? 5 : 3}
              required={key === 'description'}
              value={form[key]}
              onChange={(e) => update(key, e.target.value)}
            />
          </label>
        ))}
        <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
          <Button type="button" variant="secondary" onClick={() => router.push(`/activity/${id}`)}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save & return'}
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
