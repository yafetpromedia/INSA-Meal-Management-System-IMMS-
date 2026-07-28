'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/providers/ToastProvider';
import { api, getActiveOrganizationId } from '@/lib/api';
import { localInputToIso, type LeaveRequest, type LeaveTypeRef } from '@/lib/leave';

type StudentHit = {
  id: string;
  studentId: string;
  fullName: string;
  barcode?: string;
  campus?: { shortName?: string; name?: string };
  program?: { name?: string };
};

export default function CreateLeavePage() {
  const router = useRouter();
  const { push } = useToast();
  const [types, setTypes] = useState<LeaveTypeRef[]>([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [selected, setSelected] = useState<StudentHit | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    leaveTypeId: '',
    reason: '',
    destination: '',
    expectedExitTime: '',
    expectedReturnTime: '',
    notes: '',
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
    api<LeaveTypeRef[]>(`/leave-types?${qs}`)
      .then((data) => {
        const rows = Array.isArray(data) ? data : [];
        setTypes(rows);
        if (rows[0]) setForm((f) => ({ ...f, leaveTypeId: rows[0]!.id }));
      })
      .catch((err: Error) => {
        push({ kind: 'error', title: 'Leave types unavailable', message: err.message });
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
    const expectedExitTime = localInputToIso(form.expectedExitTime);
    const expectedReturnTime = localInputToIso(form.expectedReturnTime);
    if (!expectedExitTime || !expectedReturnTime) {
      push({ kind: 'error', title: 'Times required', message: 'Set expected exit and return.' });
      return;
    }
    if (new Date(expectedReturnTime) <= new Date(expectedExitTime)) {
      push({
        kind: 'error',
        title: 'Invalid window',
        message: 'Expected return must be after expected exit.',
      });
      return;
    }
    setSaving(true);
    try {
      const leave = await api<LeaveRequest>('/leave-requests', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: orgId,
          studentId: selected.id,
          leaveTypeId: form.leaveTypeId,
          reason: form.reason.trim(),
          destination: form.destination.trim(),
          expectedExitTime,
          expectedReturnTime,
          notes: form.notes.trim() || undefined,
        }),
      });
      push({ kind: 'success', title: 'Leave created', message: leave.leaveNumber });
      router.push(`/leave/${leave.id}`);
    } catch (err) {
      push({
        kind: 'error',
        title: 'Could not create leave',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <Link href="/leave" className="profile-back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Leave Requests
          </Link>
          <h1 className="page-title">Create leave</h1>
          <p className="page-sub">Issue a gate pass request for a student.</p>
        </div>
      </div>

      <form className="panel" onSubmit={onSubmit} style={{ display: 'grid', gap: 14, maxWidth: 640 }}>
        <div className="field">
          <span>Student</span>
          {selected ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'center',
                marginTop: 6,
              }}
            >
              <div>
                <strong style={{ fontWeight: 600 }}>{selected.fullName}</strong>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  {selected.studentId}
                  {selected.campus?.shortName ? ` · ${selected.campus.shortName}` : ''}
                  {selected.program?.name ? ` · ${selected.program.name}` : ''}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelected(null);
                  setStudentQuery('');
                }}
              >
                Change
              </Button>
            </div>
          ) : (
            <>
              <div style={{ position: 'relative', marginTop: 6 }}>
                <Search
                  size={15}
                  strokeWidth={1.75}
                  aria-hidden
                  style={{ position: 'absolute', left: 12, top: 12, opacity: 0.55 }}
                />
                <input
                  className="input"
                  style={{ paddingLeft: 36 }}
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Type student ID or name…"
                  autoComplete="off"
                />
              </div>
              {searching ? (
                <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.8rem' }}>
                  Searching…
                </p>
              ) : null}
              {hits.length > 0 ? (
                <ul
                  style={{
                    listStyle: 'none',
                    margin: '8px 0 0',
                    padding: 0,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  {hits.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(s);
                          setHits([]);
                          setStudentQuery(s.studentId);
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          background: 'transparent',
                          border: 0,
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          color: 'inherit',
                        }}
                      >
                        <strong style={{ fontWeight: 600 }}>{s.fullName}</strong>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>
                          {s.studentId}
                          {s.campus?.shortName ? ` · ${s.campus.shortName}` : ''}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>

        <label className="field">
          <span>Leave type</span>
          <select
            className="input"
            value={form.leaveTypeId}
            onChange={(e) => setForm((f) => ({ ...f, leaveTypeId: e.target.value }))}
            required
          >
            <option value="" disabled>
              Select type
            </option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <Input
          label="Reason"
          value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          required
          minLength={2}
        />
        <Input
          label="Destination"
          value={form.destination}
          onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
          required
          minLength={2}
        />
        <Input
          label="Expected exit"
          type="datetime-local"
          value={form.expectedExitTime}
          onChange={(e) => setForm((f) => ({ ...f, expectedExitTime: e.target.value }))}
          required
        />
        <Input
          label="Expected return"
          type="datetime-local"
          value={form.expectedReturnTime}
          onChange={(e) => setForm((f) => ({ ...f, expectedReturnTime: e.target.value }))}
          required
        />
        <label className="field">
          <span>Notes (optional)</span>
          <textarea
            className="input"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Any extra context for the gate officer…"
          />
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={() => router.push('/leave')}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Create leave
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
