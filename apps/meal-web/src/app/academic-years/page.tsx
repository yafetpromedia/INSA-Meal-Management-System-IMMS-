'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Trash2 } from 'lucide-react';
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

type Year = {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  isCurrent: boolean;
};

function toDateInput(value?: string | null) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export default function AcademicYearsPage() {
  const router = useRouter();
  const { push } = useToast();
  const [items, setItems] = useState<Year[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Year | null>(null);
  const [form, setForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    isActive: true,
    isCurrent: false,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Year | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  async function load() {
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    setLoading(true);
    try {
      const data = await api<Year[]>(`/academic-years${q}`);
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
      name: String(new Date().getFullYear()),
      startDate: '',
      endDate: '',
      isActive: true,
      isCurrent: false,
    });
    setModal('create');
  }

  function openEdit(y: Year) {
    setEditing(y);
    setForm({
      name: y.name,
      startDate: toDateInput(y.startDate),
      endDate: toDateInput(y.endDate),
      isActive: y.isActive,
      isCurrent: y.isCurrent,
    });
    setModal('edit');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const orgId = getActiveOrganizationId();
    setSaving(true);
    try {
      if (modal === 'create') {
        await api('/academic-years', {
          method: 'POST',
          body: JSON.stringify({
            organizationId: orgId,
            name: form.name.trim(),
            startDate: form.startDate || undefined,
            endDate: form.endDate || undefined,
            isActive: form.isActive,
            isCurrent: form.isCurrent,
          }),
        });
        push({ kind: 'success', title: 'Academic year created' });
      } else if (editing) {
        await api(`/academic-years/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            startDate: form.startDate || undefined,
            endDate: form.endDate || undefined,
            isActive: form.isActive,
          }),
        });
        push({ kind: 'success', title: 'Academic year updated' });
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

  async function setCurrent(id: string) {
    try {
      await api(`/academic-years/${id}/set-current`, { method: 'POST' });
      push({ kind: 'success', title: 'Current year updated' });
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Update failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    }
  }

  async function onDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await api(`/academic-years/${deleting.id}`, { method: 'DELETE' });
      push({ kind: 'success', title: 'Academic year deleted' });
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
          <h1 className="page-title">Academic Years</h1>
          <p className="page-sub">Separate historical meal data by training year.</p>
        </div>
        <AddButton onClick={openCreate} label="Add" />
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={36} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No academic years" actionLabel="Add" onAction={openCreate} />
      ) : (
        <div className="table-wrap">
          <table className="table zebra">
            <thead>
              <tr>
                <th>Year</th>
                <th>Start</th>
                <th>End</th>
                <th>Flags</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((y) => (
                <tr key={y.id}>
                  <td style={{ fontWeight: 500 }}>{y.name}</td>
                  <td>{y.startDate ? new Date(y.startDate).toLocaleDateString() : '—'}</td>
                  <td>{y.endDate ? new Date(y.endDate).toLocaleDateString() : '—'}</td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {y.isCurrent ? <StatusChip tone="success">Current</StatusChip> : null}
                    <StatusChip tone={y.isActive ? 'info' : 'warning'}>
                      {y.isActive ? 'Active' : 'Inactive'}
                    </StatusChip>
                  </td>
                  <td>
                    <div className="row-actions">
                      {!y.isCurrent ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => void setCurrent(y.id)}>
                          <Check size={14} strokeWidth={1.75} aria-hidden />
                          Set current
                        </Button>
                      ) : null}
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(y)}>
                        <Pencil size={14} strokeWidth={1.75} aria-hidden />
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(y)}>
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
        title={modal === 'create' ? 'Add academic year' : 'Edit academic year'}
        onClose={() => setModal(null)}
      >
        <form onSubmit={onSave} style={{ display: 'grid', gap: 12 }}>
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            placeholder="2026"
          />
          <Input
            label="Start date"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
          />
          <Input
            label="End date"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active
          </label>
          {modal === 'create' ? (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.isCurrent}
                onChange={(e) => setForm((f) => ({ ...f, isCurrent: e.target.checked }))}
              />
              Set as current year
            </label>
          ) : null}
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
        title="Delete academic year?"
        message={deleting ? `Soft-delete “${deleting.name}”?` : ''}
        loading={busyDelete}
        onConfirm={() => void onDelete()}
        onClose={() => setDeleting(null)}
      />
    </AppShell>
  );
}
