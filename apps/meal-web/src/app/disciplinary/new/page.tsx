'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Gavel, Search, UserRound } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusChip } from '@/components/ui/Badge';
import { useToast } from '@/components/providers/ToastProvider';
import { api, getActiveOrganizationId } from '@/lib/api';
import { localInputToIso } from '@/lib/leave';
import {
  formatIncidentWhen,
  incidentStatusLabel,
  incidentStatusTone,
  severityTone,
  type DisciplinaryIncident,
  type IncidentType,
} from '@/lib/disciplinary';

type StudentHit = {
  id: string;
  studentId: string;
  fullName: string;
  barcode?: string;
  campus?: { shortName?: string; name?: string };
  program?: { name?: string };
};

const SEVERITIES = [
  { value: 'LOW', hint: 'Minor / first notice' },
  { value: 'MEDIUM', hint: 'Needs follow-up' },
  { value: 'HIGH', hint: 'Serious breach' },
  { value: 'CRITICAL', hint: 'Immediate action' },
] as const;

export default function ReportIncidentPage() {
  const router = useRouter();
  const { push } = useToast();
  const [types, setTypes] = useState<IncidentType[]>([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [selected, setSelected] = useState<StudentHit | null>(null);
  const [prior, setPrior] = useState<DisciplinaryIncident[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    incidentTypeId: '',
    severity: 'LOW',
    occurredAt: '',
    location: '',
    description: '',
    witnesses: '',
    evidenceUrl: '',
  });

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }
    const orgId = getActiveOrganizationId();
    const qs = new URLSearchParams({
      activeOnly: 'true',
      ...(orgId ? { organizationId: orgId } : {}),
    });
    api<IncidentType[]>(`/incident-types?${qs}`)
      .then((data) => {
        const rows = Array.isArray(data) ? data : [];
        setTypes(rows);
        if (rows[0]) setForm((f) => ({ ...f, incidentTypeId: rows[0]!.id }));
      })
      .catch((err: Error) => {
        push({ kind: 'error', title: 'Incident types unavailable', message: err.message });
      });
  }, [router, push]);

  useEffect(() => {
    const q = studentQuery.trim();
    if (q.length < 2 || selected) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      const orgId = getActiveOrganizationId();
      const qs = new URLSearchParams({
        search: q,
        limit: '8',
        ...(orgId ? { organizationId: orgId } : {}),
      });
      setSearching(true);
      api<StudentHit[]>(`/students?${qs}`)
        .then((data) => setHits(Array.isArray(data) ? data : []))
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(t);
  }, [studentQuery, selected]);

  useEffect(() => {
    if (!selected) {
      setPrior([]);
      return;
    }
    api<DisciplinaryIncident[]>(`/disciplinary-incidents/student/${selected.id}`)
      .then((data) => setPrior(Array.isArray(data) ? data.slice(0, 5) : []))
      .catch(() => setPrior([]));
  }, [selected]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected) {
      push({ kind: 'error', title: 'Student required', message: 'Search and select a student.' });
      return;
    }
    const orgId = getActiveOrganizationId();
    if (!orgId) {
      push({
        kind: 'error',
        title: 'Organization missing',
        message: 'Sign out and sign in again to restore organization context.',
      });
      return;
    }
    const occurredAt = localInputToIso(form.occurredAt);
    if (!occurredAt) {
      push({ kind: 'error', title: 'Date/time required', message: 'Set when the incident occurred.' });
      return;
    }
    if (form.description.trim().length < 5) {
      push({
        kind: 'error',
        title: 'Description required',
        message: 'Provide a clear incident description.',
      });
      return;
    }
    setSaving(true);
    try {
      const incident = await api<DisciplinaryIncident>('/disciplinary-incidents', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: orgId,
          studentId: selected.id,
          incidentTypeId: form.incidentTypeId,
          severity: form.severity,
          occurredAt,
          location: form.location || undefined,
          description: form.description.trim(),
          witnesses: form.witnesses || undefined,
          evidenceUrl: form.evidenceUrl || undefined,
        }),
      });
      push({
        kind: 'success',
        title: 'Incident reported',
        message: incident.incidentNumber,
      });
      router.push(`/disciplinary/${incident.id}`);
    } catch (err) {
      push({
        kind: 'error',
        title: 'Could not report incident',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setSaving(false);
    }
  }

  const typesByCategory = types.reduce<Record<string, IncidentType[]>>((acc, t) => {
    const key = t.category || 'Other';
    (acc[key] ??= []).push(t);
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <Link href="/disciplinary" className="profile-back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Disciplinary cases
          </Link>
          <h1 className="page-title">Report incident</h1>
          <p className="page-sub">
            Record the case cleanly — then assign actions from the case page.
          </p>
        </div>
      </div>

      <div className="disc-report">
        <form className="panel disc-report-form" onSubmit={onSubmit}>
          <section className="disc-section">
            <header className="disc-section-head">
              <span className="disc-step">1</span>
              <div>
                <h2>Student</h2>
                <p className="muted">Who is involved in this case?</p>
              </div>
            </header>

            {selected ? (
              <div className="disc-student-card">
                <div className="disc-student-avatar" aria-hidden>
                  <UserRound size={20} strokeWidth={1.75} />
                </div>
                <div className="disc-student-meta">
                  <strong>{selected.fullName}</strong>
                  <span className="muted">
                    {selected.studentId}
                    {selected.campus?.shortName ? ` · ${selected.campus.shortName}` : ''}
                    {selected.program?.name ? ` · ${selected.program.name}` : ''}
                  </span>
                </div>
                <div className="disc-student-actions">
                  <Link href={`/students/${selected.id}`} className="dash-link">
                    View profile
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelected(null);
                      setStudentQuery('');
                      setPrior([]);
                    }}
                  >
                    Change
                  </Button>
                </div>
              </div>
            ) : (
              <div className="disc-search">
                <Search size={16} strokeWidth={1.75} aria-hidden className="disc-search-icon" />
                <input
                  className="input"
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Search by student ID or name…"
                  autoComplete="off"
                />
                {searching ? <span className="muted disc-search-hint">Searching…</span> : null}
                {hits.length > 0 ? (
                  <ul className="disc-hits">
                    {hits.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(s);
                            setHits([]);
                            setStudentQuery(s.studentId);
                          }}
                        >
                          <strong>{s.fullName}</strong>
                          <span className="muted">
                            {s.studentId}
                            {s.campus?.shortName ? ` · ${s.campus.shortName}` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </section>

          <section className="disc-section">
            <header className="disc-section-head">
              <span className="disc-step">2</span>
              <div>
                <h2>Case details</h2>
                <p className="muted">Type, severity, when and where it happened.</p>
              </div>
            </header>

            <div className="disc-grid">
              <label className="field">
                <span>Incident type</span>
                <select
                  className="select"
                  value={form.incidentTypeId}
                  onChange={(e) => setForm((f) => ({ ...f, incidentTypeId: e.target.value }))}
                  required
                >
                  <option value="" disabled>
                    Select type
                  </option>
                  {Object.entries(typesByCategory).map(([category, rows]) => (
                    <optgroup key={category} label={category}>
                      {rows.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Occurred at</span>
                <Input
                  type="datetime-local"
                  value={form.occurredAt}
                  onChange={(e) => setForm((f) => ({ ...f, occurredAt: e.target.value }))}
                  required
                />
              </label>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Severity</span>
                <div className="disc-severity" role="radiogroup" aria-label="Severity">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      className={`disc-severity-chip ${form.severity === s.value ? 'is-active' : ''} is-${s.value.toLowerCase()}`}
                      onClick={() => setForm((f) => ({ ...f, severity: s.value }))}
                      aria-pressed={form.severity === s.value}
                    >
                      <strong>{s.value}</strong>
                      <span>{s.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Location</span>
                <Input
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="Dorm, gate, classroom…"
                />
              </label>
            </div>
          </section>

          <section className="disc-section">
            <header className="disc-section-head">
              <span className="disc-step">3</span>
              <div>
                <h2>What happened</h2>
                <p className="muted">Description and optional supporting details.</p>
              </div>
            </header>

            <label className="field">
              <span>Description</span>
              <textarea
                className="textarea"
                rows={5}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Clear facts: what happened, who was involved, and what was observed."
                required
              />
            </label>

            <div className="disc-grid">
              <label className="field">
                <span>Witnesses (optional)</span>
                <Input
                  value={form.witnesses}
                  onChange={(e) => setForm((f) => ({ ...f, witnesses: e.target.value }))}
                  placeholder="Names or IDs"
                />
              </label>
              <label className="field">
                <span>Evidence URL (optional)</span>
                <Input
                  value={form.evidenceUrl}
                  onChange={(e) => setForm((f) => ({ ...f, evidenceUrl: e.target.value }))}
                  placeholder="https://…"
                />
              </label>
            </div>
          </section>

          <div className="disc-form-actions">
            <Button type="button" variant="secondary" onClick={() => router.push('/disciplinary')}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Submit report'}
            </Button>
          </div>
        </form>

        <aside className="panel disc-report-side">
          <div className="disc-side-head">
            <Gavel size={18} strokeWidth={1.75} aria-hidden />
            <div>
              <h2>Student record</h2>
              <p className="muted">Prior cases and actions for this student.</p>
            </div>
          </div>

          {!selected ? (
            <p className="muted" style={{ margin: 0 }}>
              Select a student to see their disciplinary history and where punishments are tracked.
            </p>
          ) : prior.length === 0 ? (
            <div className="disc-side-empty">
              <p className="muted" style={{ margin: 0 }}>
                No prior cases on file.
              </p>
              <Link href={`/students/${selected.id}`} className="dash-link">
                Open full student profile
              </Link>
            </div>
          ) : (
            <>
              <ul className="disc-prior-list">
                {prior.map((row) => (
                  <li key={row.id}>
                    <Link href={`/disciplinary/${row.id}`}>
                      <div className="disc-prior-top">
                        <strong>{row.incidentType?.name ?? row.incidentNumber}</strong>
                        <StatusChip tone={severityTone(row.severity)}>{row.severity}</StatusChip>
                      </div>
                      <div className="muted" style={{ fontSize: '0.75rem' }}>
                        {formatIncidentWhen(row.occurredAt)} ·{' '}
                        {row.actions?.[0]?.actionType?.name
                          ? `Action: ${row.actions[0].actionType.name}`
                          : 'No action yet'}
                      </div>
                      <StatusChip tone={incidentStatusTone(row.status)}>
                        {incidentStatusLabel(row.status)}
                      </StatusChip>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={`/students/${selected.id}`} className="dash-link" style={{ marginTop: 12 }}>
                See full history on student profile →
              </Link>
            </>
          )}

          <div className="disc-side-hint">
            <strong>Where to find punishments</strong>
            <p className="muted">
              Open <b>Students → student profile → Disciplinary history</b>, or open any case under{' '}
              <b>Disciplinary</b> to see assigned actions.
            </p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
