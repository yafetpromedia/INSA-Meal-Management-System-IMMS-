'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { AddButton } from '@/components/ui/AddButton';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { api, getActiveOrganizationId } from '@/lib/api';

type Staff = {
  id: string;
  fullName: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  roles: Array<{ role: { name: string } }>;
  campusAssignments?: Array<{ campusId: string }>;
  mentorProfile?: {
    campusId: string;
    programId?: string | null;
    academicYearId: string;
    campus?: { id: string; name: string; shortName?: string | null } | null;
    program?: { id: string; name: string } | null;
    academicYear?: { id: string; name: string } | null;
  } | null;
};

type Campus = { id: string; name: string; shortName: string };
type Program = { id: string; name: string; campusId: string };
type AcademicYear = { id: string; name: string; isCurrent?: boolean };

type StaffRole = 'Mentor' | 'FoodStaff' | 'GateOfficer';

function roleLabel(name: string) {
  if (name === 'FoodStaff') return 'Cafeteria staff';
  if (name === 'Mentor') return 'Mentor';
  if (name === 'GateOfficer') return 'Gate Officer';
  return name;
}

function generateTempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)]!;
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = 0; i < 8; i += 1) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

function isStrongPassword(password: string) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password);
}

export default function StaffPage() {
  const router = useRouter();
  const { push } = useToast();
  const [items, setItems] = useState<Staff[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    roleName: 'Mentor' as StaffRole,
    campusIds: [] as string[],
    campusId: '',
    programId: '',
    academicYearId: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Staff | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const campusPrograms = useMemo(
    () => programs.filter((p) => !form.campusId || p.campusId === form.campusId),
    [programs, form.campusId],
  );

  async function load() {
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    setLoading(true);
    try {
      const [staff, campusList, programList, yearList] = await Promise.all([
        api<Staff[]>('/mentors'),
        api<Campus[]>(`/campuses${q}`),
        api<Program[]>(`/programs${q}`),
        api<AcademicYear[]>(`/academic-years${q}`),
      ]);
      setItems(Array.isArray(staff) ? staff : []);
      setCampuses(Array.isArray(campusList) ? campusList : []);
      setPrograms(Array.isArray(programList) ? programList : []);
      setYears(Array.isArray(yearList) ? yearList : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    void load();
  }, [router]);

  function openCreate() {
    setEditing(null);
    setShowPassword(true);
    const currentYear = years.find((y) => y.isCurrent) ?? years[0];
    setForm({
      fullName: '',
      username: '',
      email: '',
      phone: '',
      password: generateTempPassword(),
      roleName: 'Mentor',
      campusIds: campuses[0] ? [campuses[0].id] : [],
      campusId: campuses[0]?.id ?? '',
      programId: '',
      academicYearId: currentYear?.id ?? '',
    });
    setModal('create');
  }

  function openEdit(m: Staff) {
    setEditing(m);
    const role = m.roles.find(
      (r) =>
        r.role.name === 'FoodStaff' ||
        r.role.name === 'Mentor' ||
        r.role.name === 'GateOfficer',
    )?.role.name as StaffRole | undefined;
    setForm({
      fullName: m.fullName,
      username: m.username,
      email: m.email ?? '',
      phone: m.phone ?? '',
      password: '',
      roleName: role ?? 'Mentor',
      campusIds: m.campusAssignments?.map((c) => c.campusId) ?? [],
      campusId: m.mentorProfile?.campusId ?? m.campusAssignments?.[0]?.campusId ?? '',
      programId: m.mentorProfile?.programId ?? '',
      academicYearId: m.mentorProfile?.academicYearId ?? '',
    });
    setModal('edit');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const orgId = getActiveOrganizationId();
    if (modal === 'create' && !isStrongPassword(form.password)) {
      push({
        kind: 'error',
        title: 'Weak password',
        message:
          'Use at least 8 characters with uppercase, lowercase, number, and special character — or click Generate.',
      });
      return;
    }
    setSaving(true);
    try {
      if (modal === 'create') {
        if (form.roleName === 'Mentor') {
          if (!form.campusId || !form.academicYearId) {
            push({
              kind: 'error',
              title: 'Campus & year required',
              message: 'Mentors must be assigned to one campus and an academic year.',
            });
            setSaving(false);
            return;
          }
        } else if (form.campusIds.length === 0) {
          push({
            kind: 'error',
            title: 'Campus required',
            message: 'Pick at least one campus so they can scan students.',
          });
          setSaving(false);
          return;
        }

        await api('/mentors', {
          method: 'POST',
          body: JSON.stringify({
            username: form.username.trim().toLowerCase(),
            email: form.email.trim() || undefined,
            fullName: form.fullName.trim(),
            password: form.password,
            phone: form.phone.trim() || undefined,
            roleName: form.roleName,
            organizationIds: orgId ? [orgId] : [],
            ...(form.roleName === 'Mentor'
              ? {
                  campusId: form.campusId,
                  programId: form.programId || undefined,
                  academicYearId: form.academicYearId,
                }
              : { campusIds: form.campusIds }),
          }),
        });
        push({
          kind: 'success',
          title:
            form.roleName === 'FoodStaff'
              ? 'Cafeteria staff created'
              : form.roleName === 'GateOfficer'
                ? 'Gate officer created'
                : 'Mentor created',
          message:
            form.roleName === 'Mentor'
              ? 'This mentor is scoped to their assigned campus only.'
              : undefined,
        });
      } else if (editing) {
        if (form.roleName === 'Mentor') {
          if (!form.campusId || !form.academicYearId) {
            push({
              kind: 'error',
              title: 'Campus & year required',
              message: 'Mentors must stay assigned to one campus and academic year.',
            });
            setSaving(false);
            return;
          }
          await api(`/mentors/${editing.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              fullName: form.fullName.trim(),
              phone: form.phone.trim() || undefined,
              campusId: form.campusId,
              programId: form.programId || null,
              academicYearId: form.academicYearId,
            }),
          });
        } else {
          if (form.campusIds.length === 0) {
            push({
              kind: 'error',
              title: 'Campus required',
              message: 'Pick at least one campus.',
            });
            setSaving(false);
            return;
          }
          await api(`/mentors/${editing.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              fullName: form.fullName.trim(),
              phone: form.phone.trim() || undefined,
              campusIds: form.campusIds,
            }),
          });
        }
        push({
          kind: 'success',
          title: 'Staff updated',
          message: 'If they are signed in, ask them to sign out and sign in again to refresh campus access.',
        });
      }
      setModal(null);
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await api(`/mentors/${deleting.id}`, { method: 'DELETE' });
      push({ kind: 'success', title: 'Staff removed' });
      setDeleting(null);
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setBusyDelete(false);
    }
  }

  function toggleCampus(id: string) {
    setForm((f) => ({
      ...f,
      campusIds: f.campusIds.includes(id)
        ? f.campusIds.filter((x) => x !== id)
        : [...f.campusIds, id],
    }));
  }

  function campusLabel(m: Staff) {
    if (m.mentorProfile?.campus) {
      return m.mentorProfile.campus.shortName || m.mentorProfile.campus.name;
    }
    const ids = m.campusAssignments?.map((c) => c.campusId) ?? [];
    if (!ids.length) return null;
    return ids
      .map((id) => campuses.find((c) => c.id === id)?.shortName ?? 'Campus')
      .join(', ');
  }

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="page-sub">
            Mentors are camp-specific. Cafeteria and gate staff may cover one or more campuses.
          </p>
        </div>
        <AddButton onClick={openCreate} label="Add" />
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={36} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No staff yet" actionLabel="Add mentor" onAction={openCreate} />
      ) : (
        <div className="table-wrap">
          <table className="table zebra">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Campus</th>
                <th>Program / Year</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.fullName}</td>
                  <td>@{m.username}</td>
                  <td>{m.roles.map((r) => roleLabel(r.role.name)).join(', ') || '—'}</td>
                  <td>
                    {!campusLabel(m) ? (
                      <StatusChip tone="warning">None — cannot scan</StatusChip>
                    ) : (
                      campusLabel(m)
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: '0.8125rem' }}>
                    {m.mentorProfile
                      ? `${m.mentorProfile.program?.name ?? 'All programs'} · ${m.mentorProfile.academicYear?.name ?? '—'}`
                      : '—'}
                  </td>
                  <td>
                    <StatusChip tone={m.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {m.status}
                    </StatusChip>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(m)}>
                        <Pencil size={14} strokeWidth={1.75} aria-hidden />
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(m)}>
                        <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modal !== null}
        title={modal === 'create' ? 'Add staff' : 'Edit staff'}
        onClose={() => setModal(null)}
      >
        <form onSubmit={onSave} style={{ display: 'grid', gap: 12 }}>
          {modal === 'create' ? (
            <div className="field">
              <span>Account type</span>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {(
                  [
                    ['Mentor', 'Camp-specific. Sees only their campus students, meals, leave, and discipline.'],
                    ['FoodStaff', 'Cafeteria door scan. Assign one or more campuses.'],
                    ['GateOfficer', 'Gate exit/return scans. Assign one or more campuses.'],
                  ] as const
                ).map(([role, hint]) => (
                  <label key={role} className="checkbox-row" style={{ alignItems: 'flex-start' }}>
                    <input
                      type="radio"
                      name="roleName"
                      checked={form.roleName === role}
                      onChange={() => setForm((f) => ({ ...f, roleName: role }))}
                    />
                    <span>
                      <strong style={{ fontWeight: 600 }}>{roleLabel(role)}</strong>
                      <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                        {hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Role: {roleLabel(form.roleName)} (change role by creating a new account)
            </p>
          )}
          <Input
            label="Full name"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            required
          />
          <Input
            label="Username"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            required
            minLength={3}
            disabled={modal === 'edit'}
            autoComplete="off"
          />
          <Input
            label="Email (optional)"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            disabled={modal === 'edit'}
          />
          {modal === 'create' ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <Input
                label="Temporary password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setForm((f) => ({ ...f, password: generateTempPassword() }));
                    setShowPassword(true);
                  }}
                >
                  Generate
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>
          ) : null}
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />

          {form.roleName === 'Mentor' ? (
            <>
              <label className="field">
                <span>Campus (required)</span>
                <select
                  className="select"
                  value={form.campusId}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      campusId: e.target.value,
                      programId: '',
                    }))
                  }
                  required
                >
                  <option value="" disabled>
                    Select campus
                  </option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.shortName} — {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Academic year (required)</span>
                <select
                  className="select"
                  value={form.academicYearId}
                  onChange={(e) => setForm((f) => ({ ...f, academicYearId: e.target.value }))}
                  required
                >
                  <option value="" disabled>
                    Select year
                  </option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                      {y.isCurrent ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Program (optional)</span>
                <select
                  className="select"
                  value={form.programId}
                  onChange={(e) => setForm((f) => ({ ...f, programId: e.target.value }))}
                >
                  <option value="">All programs on this campus</option>
                  {campusPrograms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : campuses.length > 0 ? (
            <div className="field">
              <span>Campus access</span>
              <p className="muted" style={{ margin: '4px 0 8px', fontSize: '0.75rem' }}>
                Required — they can only operate on assigned campuses.
              </p>
              <div style={{ display: 'grid', gap: 6 }}>
                {campuses.map((c) => (
                  <label key={c.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={form.campusIds.includes(c.id)}
                      onChange={() => toggleCampus(c.id)}
                    />
                    {c.shortName} — {c.name}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="error" style={{ margin: 0 }}>
              Create a campus first, then assign staff to it.
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Remove staff?"
        message={
          deleting
            ? `Soft-delete “${deleting.fullName}”? They will lose login access.`
            : ''
        }
        loading={busyDelete}
        onConfirm={() => void onDelete()}
        onClose={() => setDeleting(null)}
      />
    </AppShell>
  );
}
