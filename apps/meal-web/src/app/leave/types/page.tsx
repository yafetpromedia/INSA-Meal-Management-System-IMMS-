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

type LeaveType = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  sortOrder?: number;
};

export default function LeaveTypesPage() {
  const router = useRouter();
  const { push } = useToast();
  const [items, setItems] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [form, setForm] = useState({ name: '', description: '', active: true });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<LeaveType | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  async function load() {
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    setLoading(true);
    setError('');
    try {
      const data = await api<LeaveType[]>(`/leave-types${q}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leave types');
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
    setForm({ name: '', description: '', active: true });
    setModal('create');
  }

  function openEdit(t: LeaveType) {
    setEditing(t);
    setForm({
      name: t.name,
      description: t.description ?? '',
      active: t.active,
    });
    setModal('edit');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const orgId = getActiveOrganizationId();
    setSaving(true);
    try {
      if (modal === 'create') {
        await api('/leave-types', {
          method: 'POST',
          body: JSON.stringify({
            organizationId: orgId,
            name: form.name.trim(),
            description: form.description.trim() || undefined,
          }),
        });
        push({ kind: 'success', title: 'Leave type created' });
      } else if (editing) {
        await api(`/leave-types/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            active: form.active,
          }),
        });
        push({ kind: 'success', title: 'Leave type updated' });
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
      await api(`/leave-types/${deleting.id}`, { method: 'DELETE' });
      push({ kind: 'success', title: 'Leave type deleted' });
      setDeleting(null);
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Delete failed',
        message: err instanceof Error ? err.message : 'Deactivate it instead if it has requests.',
      });
    } finally {
      setBusyDelete(false);
    }
  }

  async function toggleActive(t: LeaveType) {
    try {
      await api(`/leave-types/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !t.active }),
      });
      push({
        kind: 'success',
        title: t.active ? 'Leave type deactivated' : 'Leave type activated',
      });
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Update failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    }
  }

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="page-title">Leave Types</h1>
          <p className="page-sub">Configure the kinds of leave students can request.</p>
        </div>
        <AddButton onClick={openCreate} label="Add type" />
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={36} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No leave types yet" actionLabel="Add type" onAction={openCreate} />
      ) : (
        <div className="table-wrap">
          <table className="table zebra">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 500 }}>{t.name}</td>
                  <td>{t.description || '—'}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => void toggleActive(t)}
                      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                      title="Toggle active"
                    >
                      <StatusChip tone={t.active ? 'success' : 'warning'}>
                        {t.active ? 'Active' : 'Inactive'}
                      </StatusChip>
                    </button>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(t)}>
                        <Pencil size={14} strokeWidth={1.75} aria-hidden />
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(t)}>
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
        title={modal === 'create' ? 'Add leave type' : 'Edit leave type'}
        onClose={() => setModal(null)}
      >
        <form onSubmit={onSave} style={{ display: 'grid', gap: 12 }}>
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            minLength={2}
          />
          <label className="field">
            <span>Description</span>
            <textarea
              className="input"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
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
        title="Delete leave type?"
        message={
          deleting
            ? `Delete “${deleting.name}”? Types with existing leave requests cannot be deleted.`
            : ''
        }
        loading={busyDelete}
        onConfirm={() => void onDelete()}
        onClose={() => setDeleting(null)}
      />
    </AppShell>
  );
}
