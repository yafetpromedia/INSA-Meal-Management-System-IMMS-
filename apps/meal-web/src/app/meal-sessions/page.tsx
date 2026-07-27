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
import { APP_TIMEZONE_LABEL, formatSessionWindow } from '@/lib/timezone';

type Session = {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  gracePeriod: number;
  isActive: boolean;
  sortOrder: number;
};

export default function MealSessionsPage() {
  const router = useRouter();
  const { push } = useToast();
  const [items, setItems] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Session | null>(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    startTime: '07:00',
    endTime: '09:00',
    gracePeriod: '15',
    sortOrder: '1',
    isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Session | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  async function load() {
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    setLoading(true);
    try {
      const data = await api<Session[]>(`/meal-sessions${q}`);
      setItems(Array.isArray(data) ? data : []);
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
    setForm({
      code: '',
      name: '',
      startTime: '07:00',
      endTime: '09:00',
      gracePeriod: '15',
      sortOrder: String((items.length || 0) + 1),
      isActive: true,
    });
    setModal('create');
  }

  function openEdit(s: Session) {
    setEditing(s);
    setForm({
      code: s.code,
      name: s.name,
      startTime: s.startTime.slice(0, 5),
      endTime: s.endTime.slice(0, 5),
      gracePeriod: String(s.gracePeriod),
      sortOrder: String(s.sortOrder),
      isActive: s.isActive,
    });
    setModal('edit');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const orgId = getActiveOrganizationId();
    if (!orgId) {
      push({ kind: 'error', title: 'No organization selected' });
      return;
    }
    setSaving(true);
    try {
      if (modal === 'create') {
        await api('/meal-sessions', {
          method: 'POST',
          body: JSON.stringify({
            organizationId: orgId,
            code: form.code.trim().toUpperCase(),
            name: form.name.trim(),
            startTime: form.startTime.slice(0, 5),
            endTime: form.endTime.slice(0, 5),
            gracePeriod: Number(form.gracePeriod) || 0,
            sortOrder: Number(form.sortOrder) || 0,
            isActive: form.isActive,
          }),
        });
        push({ kind: 'success', title: 'Meal session created' });
      } else if (editing) {
        await api(`/meal-sessions/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            startTime: form.startTime.slice(0, 5),
            endTime: form.endTime.slice(0, 5),
            gracePeriod: Number(form.gracePeriod) || 0,
            sortOrder: Number(form.sortOrder) || 0,
            isActive: form.isActive,
          }),
        });
        push({ kind: 'success', title: 'Meal session updated' });
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
      await api(`/meal-sessions/${deleting.id}`, { method: 'DELETE' });
      push({ kind: 'success', title: 'Meal session deleted' });
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

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="page-title">Meal Sessions</h1>
          <p className="page-sub">Breakfast, lunch, and dinner windows in Ethiopia time (EAT).</p>
        </div>
        <AddButton onClick={openCreate} label="Add" />
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={36} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No meal sessions" actionLabel="Add" onAction={openCreate} />
      ) : (
        <div className="table-wrap">
          <table className="table zebra">
            <thead>
              <tr>
                <th>Session</th>
                <th>Code</th>
                <th>Window</th>
                <th>Grace</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td>
                    <code style={{ fontSize: '0.8125rem' }}>{s.code}</code>
                  </td>
                  <td>
                    {formatSessionWindow(s.startTime, s.endTime)}
                  </td>
                  <td>{s.gracePeriod} min</td>
                  <td>
                    <StatusChip tone={s.isActive ? 'success' : 'warning'}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </StatusChip>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(s)}>
                        <Pencil size={14} strokeWidth={1.75} aria-hidden />
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(s)}>
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
        title={modal === 'create' ? 'Add meal session' : 'Edit meal session'}
        onClose={() => setModal(null)}
      >
        <form onSubmit={onSave} style={{ display: 'grid', gap: 12 }}>
          {modal === 'create' ? (
            <Input
              label="Code"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              required
              placeholder="BREAKFAST"
            />
          ) : (
            <Input label="Code" value={form.code} disabled />
          )}
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label={`Start time (${APP_TIMEZONE_LABEL})`}
            type="time"
            value={form.startTime}
            onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
            required
          />
          <Input
            label={`End time (${APP_TIMEZONE_LABEL})`}
            type="time"
            value={form.endTime}
            onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
            required
          />
          <Input
            label="Grace period (minutes)"
            type="number"
            value={form.gracePeriod}
            onChange={(e) => setForm((f) => ({ ...f, gracePeriod: e.target.value }))}
          />
          <Input
            label="Sort order"
            type="number"
            value={form.sortOrder}
            onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active
          </label>
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
        title="Delete meal session?"
        message={deleting ? `Soft-delete “${deleting.name}”?` : ''}
        loading={busyDelete}
        onConfirm={() => void onDelete()}
        onClose={() => setDeleting(null)}
      />
    </AppShell>
  );
}
