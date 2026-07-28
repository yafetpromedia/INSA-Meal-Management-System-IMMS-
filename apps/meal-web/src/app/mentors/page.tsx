'use client';

import { FormEvent, useEffect, useState } from 'react';
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
};

type Campus = { id: string; name: string; shortName: string };

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
    roleName: 'FoodStaff' as StaffRole,
    campusIds: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Staff | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function load() {
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    setLoading(true);
    try {
      const [staff, campusList] = await Promise.all([
        api<Staff[]>('/mentors'),
        api<Campus[]>(`/campuses${q}`),
      ]);
      setItems(Array.isArray(staff) ? staff : []);
      setCampuses(Array.isArray(campusList) ? campusList : []);
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
    setForm({
      fullName: '',
      username: '',
      email: '',
      phone: '',
      password: generateTempPassword(),
      roleName: 'FoodStaff',
      campusIds: campuses[0] ? [campuses[0].id] : [],
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
        if (form.campusIds.length === 0) {
          push({
            kind: 'error',
            title: 'Campus required',
            message: 'Pick at least one campus so they can scan students at meal distribution.',
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
            campusIds: form.campusIds,
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
            form.roleName === 'FoodStaff'
              ? 'They can sign in and only use Meal Distribution (door scan).'
              : form.roleName === 'GateOfficer'
                ? 'They can sign in and use Gate Scanner for exit/return.'
                : undefined,
        });
      } else if (editing) {
        if (form.campusIds.length === 0) {
          push({
            kind: 'error',
            title: 'Campus required',
            message: 'Pick at least one campus so they can scan students at meal distribution.',
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

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="page-title">Staff</h1>
          <p className="page-sub">
            Mentors, cafeteria door staff, and gate officers who scan student barcodes.
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
        <EmptyState
          title="No staff yet"
          actionLabel="Add cafeteria staff"
          onAction={openCreate}
        />
      ) : (
        <div className="table-wrap">
          <table className="table zebra">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Campuses</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.fullName}</td>
                  <td>@{m.username}</td>
                  <td>
                    {m.roles.map((r) => roleLabel(r.role.name)).join(', ') || '—'}
                  </td>
                  <td>
                    {(m.campusAssignments?.length ?? 0) === 0 ? (
                      <StatusChip tone="warning">None — cannot scan</StatusChip>
                    ) : (
                      m.campusAssignments?.length
                    )}
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
                <label className="checkbox-row" style={{ alignItems: 'flex-start' }}>
                  <input
                    type="radio"
                    name="roleName"
                    checked={form.roleName === 'FoodStaff'}
                    onChange={() => setForm((f) => ({ ...f, roleName: 'FoodStaff' }))}
                  />
                  <span>
                    <strong style={{ fontWeight: 600 }}>Cafeteria staff</strong>
                    <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                      Door scan only — Meal Distribution camera/barcode. No admin menus.
                    </span>
                  </span>
                </label>
                <label className="checkbox-row" style={{ alignItems: 'flex-start' }}>
                  <input
                    type="radio"
                    name="roleName"
                    checked={form.roleName === 'Mentor'}
                    onChange={() => setForm((f) => ({ ...f, roleName: 'Mentor' }))}
                  />
                  <span>
                    <strong style={{ fontWeight: 600 }}>Mentor</strong>
                    <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                      Can scan meals plus view students, history, and reports.
                    </span>
                  </span>
                </label>
                <label className="checkbox-row" style={{ alignItems: 'flex-start' }}>
                  <input
                    type="radio"
                    name="roleName"
                    checked={form.roleName === 'GateOfficer'}
                    onChange={() => setForm((f) => ({ ...f, roleName: 'GateOfficer' }))}
                  />
                  <span>
                    <strong style={{ fontWeight: 600 }}>Gate Officer</strong>
                    <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                      Exit / return scans at the campus gate. Sees Students Outside.
                    </span>
                  </span>
                </label>
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
              <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>
                Give this login to the cafeteria scanner. Must include uppercase, lowercase, number,
                and special character.
              </p>
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
          {campuses.length > 0 ? (
            <div className="field">
              <span>Campus access</span>
              <p className="muted" style={{ margin: '4px 0 8px', fontSize: '0.75rem' }}>
                Required — mentors can only scan students on assigned campuses.
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
