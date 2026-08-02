'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Mic, Search, Trash2, Upload } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { VoiceNoteRecorder } from '@/components/activity/VoiceNoteRecorder';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/providers/ToastProvider';
import { api, getActiveOrganizationId } from '@/lib/api';
import { formatFileSize, type ActivityCategory, type ActivityReport } from '@/lib/activity';
import { readStoredUser } from '@/lib/rbac';

type Option = { id: string; name: string; shortName?: string | null; isCurrent?: boolean };
type StudentHit = {
  id: string;
  studentId: string;
  fullName: string;
  campus?: { shortName?: string; name?: string };
};

type FormOptions = {
  categories: ActivityCategory[];
  campuses: Option[];
  programs: Option[];
  academicYears: Option[];
};

type PendingMedia = {
  id: string;
  file: File;
  caption?: string;
  previewUrl?: string;
};

function kindOf(file: File): 'image' | 'audio' | 'other' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'other';
}

export default function NewActivityReportPage() {
  const router = useRouter();
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [campuses, setCampuses] = useState<Option[]>([]);
  const [programs, setPrograms] = useState<Option[]>([]);
  const [years, setYears] = useState<Option[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [participants, setParticipants] = useState<StudentHit[]>([]);
  const [form, setForm] = useState({
    title: '',
    categoryId: '',
    campusId: '',
    programId: '',
    academicYearId: '',
    reportDate: new Date().toISOString().slice(0, 10),
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

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }
    const orgId = getActiveOrganizationId();
    const user = readStoredUser();
    const qs = orgId ? `?organizationId=${orgId}` : '';
    setLoadingOptions(true);
    api<FormOptions>(`/activity-reports/form-options${qs}`)
      .then((data) => {
        const cRows = Array.isArray(data.categories) ? data.categories : [];
        const camRows = Array.isArray(data.campuses) ? data.campuses : [];
        const pRows = Array.isArray(data.programs) ? data.programs : [];
        const yRows = Array.isArray(data.academicYears) ? data.academicYears : [];
        setCategories(cRows);
        setCampuses(camRows);
        setPrograms(pRows);
        setYears(yRows);
        const mentorCampus = user?.mentorProfile?.campusId ?? '';
        const currentYear =
          user?.mentorProfile?.academicYearId ??
          yRows.find((y) => y.isCurrent)?.id ??
          yRows[0]?.id ??
          '';
        setForm((f) => ({
          ...f,
          categoryId: cRows[0]?.id ?? '',
          campusId: mentorCampus || camRows[0]?.id || '',
          programId: user?.mentorProfile?.programId ?? '',
          academicYearId: currentYear,
        }));
        if (!cRows.length) {
          push({
            kind: 'warning',
            title: 'No categories yet',
            message: 'Ask an admin to add activity categories before submitting.',
          });
        }
      })
      .catch((err: Error) => {
        push({ kind: 'error', title: 'Could not load form options', message: err.message });
      })
      .finally(() => setLoadingOptions(false));
  }, [router, push]);

  useEffect(() => {
    return () => {
      for (const item of pending) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = studentQuery.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      const orgId = getActiveOrganizationId();
      const qs = new URLSearchParams({
        search: q,
        limit: '8',
        ...(orgId ? { organizationId: orgId } : {}),
        ...(form.campusId ? { campusId: form.campusId } : {}),
      });
      api<StudentHit[]>(`/students?${qs}`)
        .then((data) => setHits(Array.isArray(data) ? data : []))
        .catch(() => setHits([]));
    }, 280);
    return () => window.clearTimeout(t);
  }, [studentQuery, form.campusId]);

  const lockedCampus = Boolean(readStoredUser()?.mentorProfile?.campusId);

  const pendingSummary = useMemo(() => {
    const photos = pending.filter((p) => kindOf(p.file) === 'image').length;
    const voices = pending.filter((p) => kindOf(p.file) === 'audio').length;
    const other = pending.length - photos - voices;
    return { photos, voices, other };
  }, [pending]);

  function addFiles(files: FileList | File[], caption?: string) {
    const list = Array.from(files);
    if (!list.length) return;
    setPending((prev) => [
      ...prev,
      ...list.map((file) => {
        const kind = kindOf(file);
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          caption: caption || (kind === 'audio' ? 'Voice note' : undefined),
          previewUrl:
            kind === 'image' || kind === 'audio' ? URL.createObjectURL(file) : undefined,
        } satisfies PendingMedia;
      }),
    ]);
  }

  function removePending(id: string) {
    setPending((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const orgId = getActiveOrganizationId();
    if (!orgId) {
      push({
        kind: 'error',
        title: 'Organization missing',
        message: 'Sign out and sign in again to restore organization context.',
      });
      return;
    }
    if (!form.categoryId || !form.campusId || !form.academicYearId) {
      push({
        kind: 'error',
        title: 'Missing fields',
        message: 'Category, campus, and academic year are required.',
      });
      return;
    }
    if (form.title.trim().length < 3 || form.description.trim().length < 5) {
      push({
        kind: 'error',
        title: 'Incomplete report',
        message: 'Title and description are required.',
      });
      return;
    }
    setSaving(true);
    try {
      const report = await api<ActivityReport>('/activity-reports', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: orgId,
          title: form.title.trim(),
          categoryId: form.categoryId,
          campusId: form.campusId,
          programId: form.programId || undefined,
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
          studentIds: participants.map((p) => p.id),
        }),
      });

      let uploaded = 0;
      for (const item of pending) {
        const body = new FormData();
        body.append('file', item.file);
        if (item.caption) body.append('caption', item.caption);
        await api(`/activity-reports/${report.id}/media`, { method: 'POST', body });
        uploaded += 1;
      }

      push({
        kind: 'success',
        title: 'Draft saved',
        message:
          uploaded > 0
            ? `${report.reportNumber} · ${uploaded} attachment(s)`
            : report.reportNumber,
      });
      router.push(`/activity/${report.id}`);
    } catch (err) {
      push({
        kind: 'error',
        title: 'Could not create report',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <header className="activity-head">
        <div className="activity-head-text">
          <Link href="/activity" className="profile-back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Activity reports
          </Link>
          <h1>New report</h1>
          <p>Write the day, attach photos or a voice note, then save the draft.</p>
        </div>
      </header>

      <form className="activity-create" onSubmit={onSubmit}>
        <section className="activity-create-section panel">
          <div className="activity-create-section-head">
            <h2>Basics</h2>
            <p>What happened, where, and when.</p>
          </div>
          <div className="activity-create-grid">
            <label className="field activity-create-span">
              <span>Title</span>
              <Input
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Cybersecurity Lab — Day 3"
                disabled={loadingOptions}
              />
            </label>

            <label className="field">
              <span>Category</span>
              <select
                className="select"
                required
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                disabled={loadingOptions || !categories.length}
              >
                {!categories.length ? <option value="">No categories</option> : null}
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
                onChange={(e) => setForm((f) => ({ ...f, campusId: e.target.value }))}
                disabled={loadingOptions || lockedCampus || !campuses.length}
              >
                {!campuses.length ? <option value="">No campuses</option> : null}
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
                onChange={(e) => setForm((f) => ({ ...f, programId: e.target.value }))}
                disabled={loadingOptions}
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
                onChange={(e) => setForm((f) => ({ ...f, academicYearId: e.target.value }))}
                disabled={loadingOptions || !years.length}
              >
                {!years.length ? <option value="">No years</option> : null}
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                    {y.isCurrent ? ' (current)' : ''}
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
                onChange={(e) => setForm((f) => ({ ...f, reportDate: e.target.value }))}
              />
            </label>

            <label className="field">
              <span>Start</span>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </label>

            <label className="field">
              <span>End</span>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </label>

            <label className="field">
              <span>Venue</span>
              <Input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Lab, hall, outdoor…"
              />
            </label>

            <label className="field">
              <span>Participants</span>
              <Input
                type="number"
                min={0}
                value={form.participantCount}
                onChange={(e) => setForm((f) => ({ ...f, participantCount: e.target.value }))}
              />
            </label>
          </div>
        </section>

        <section className="activity-create-section panel">
          <div className="activity-create-section-head">
            <h2>Photos, files &amp; voice</h2>
            <p>Attach evidence here before you save — or add more later on the report.</p>
          </div>

          <div className="activity-media-actions">
            <div
              className={`upload-dropzone ${dragging ? 'is-dragging' : ''}`}
              onDragEnter={(e) => {
                e.preventDefault();
                dragDepth.current += 1;
                setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                dragDepth.current -= 1;
                if (dragDepth.current <= 0) {
                  dragDepth.current = 0;
                  setDragging(false);
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                dragDepth.current = 0;
                setDragging(false);
                if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
              }}
            >
              <Upload size={22} strokeWidth={1.75} aria-hidden />
              <strong>Drop photos or files</strong>
              <span className="muted">Images, PDF, Word, PowerPoint, video, or audio</span>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,video/mp4,video/webm,audio/*"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="activity-voice-panel">
              <strong>Voice note</strong>
              <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
                Record a short spoken update from your microphone.
              </p>
              <VoiceNoteRecorder
                disabled={saving}
                onRecorded={(file) => addFiles([file], 'Voice note')}
              />
            </div>
          </div>

          {pending.length ? (
            <>
              <p className="activity-pending-summary muted">
                Ready to attach: {pendingSummary.photos} photo
                {pendingSummary.photos === 1 ? '' : 's'}
                {pendingSummary.voices
                  ? ` · ${pendingSummary.voices} voice note${pendingSummary.voices === 1 ? '' : 's'}`
                  : ''}
                {pendingSummary.other
                  ? ` · ${pendingSummary.other} other file${pendingSummary.other === 1 ? '' : 's'}`
                  : ''}
              </p>
              <ul className="activity-pending-list">
                {pending.map((item) => {
                  const kind = kindOf(item.file);
                  return (
                    <li key={item.id} className="activity-pending-item">
                      <div className="activity-pending-thumb" aria-hidden>
                        {kind === 'image' && item.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.previewUrl} alt="" />
                        ) : kind === 'audio' ? (
                          <Mic size={18} strokeWidth={1.75} />
                        ) : (
                          <FileText size={18} strokeWidth={1.75} />
                        )}
                      </div>
                      <div className="activity-pending-meta">
                        <strong>{item.caption || item.file.name}</strong>
                        <span className="muted">
                          {formatFileSize(item.file.size)}
                          {kind === 'audio' ? ' · Voice note' : ''}
                        </span>
                        {kind === 'audio' && item.previewUrl ? (
                          // eslint-disable-next-line jsx-a11y/media-has-caption
                          <audio
                            controls
                            src={item.previewUrl}
                            preload="metadata"
                            className="activity-pending-audio"
                          />
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removePending(item.id)}
                        aria-label={`Remove ${item.file.name}`}
                      >
                        <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              No attachments yet — photos and voice notes are optional.
            </p>
          )}
        </section>

        <section className="activity-create-section panel">
          <div className="activity-create-section-head">
            <h2>Description</h2>
            <p>Short summary of the activity (required).</p>
          </div>
          <label className="field">
            <span>What happened</span>
            <textarea
              className="textarea"
              rows={5}
              required
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Summarize the session for campus and national review…"
            />
          </label>

          <button
            type="button"
            className="activity-more-toggle"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
          >
            {showMore ? 'Hide extra details' : 'Add objectives, outcomes & more (optional)'}
          </button>

          {showMore ? (
            <div className="activity-create-stack" style={{ marginTop: 12 }}>
              {(
                [
                  ['objectives', 'Objectives'],
                  ['activitiesPerformed', 'Activities performed'],
                  ['outcomes', 'Outcomes'],
                  ['challenges', 'Challenges'],
                  ['recommendations', 'Recommendations'],
                ] as const
              ).map(([key, label]) => (
                <label className="field" key={key}>
                  <span>
                    {label}
                    <em className="muted"> · optional</em>
                  </span>
                  <textarea
                    className="textarea"
                    rows={3}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          ) : null}
        </section>

        <section className="activity-create-section panel">
          <div className="activity-create-section-head">
            <h2>Students</h2>
            <p>Optional tags for people who took part.</p>
          </div>
          <label className="field">
            <span>Search students</span>
            <div className="activity-search">
              <Search size={15} strokeWidth={1.75} aria-hidden />
              <Input
                placeholder="Name or student ID…"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
              />
            </div>
          </label>
          {hits.length ? (
            <ul className="search-hits" style={{ marginTop: 8 }}>
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="search-hit"
                    onClick={() => {
                      setParticipants((prev) =>
                        prev.some((p) => p.id === h.id) ? prev : [...prev, h],
                      );
                      setStudentQuery('');
                      setHits([]);
                    }}
                  >
                    {h.fullName} · {h.studentId}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {participants.length ? (
            <div className="meal-chips" style={{ marginTop: 10 }}>
              {participants.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="chip"
                  onClick={() => setParticipants((prev) => prev.filter((x) => x.id !== p.id))}
                >
                  {p.fullName} ×
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <div className="activity-create-foot panel">
          <p className="activity-create-hint">
            <Mic size={14} strokeWidth={1.75} aria-hidden />
            {pending.length
              ? `${pending.length} file(s) will upload when you save`
              : 'You can still add media after saving'}
          </p>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => router.push('/activity')}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || loadingOptions}>
              {saving ? 'Saving…' : 'Save draft'}
            </Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
