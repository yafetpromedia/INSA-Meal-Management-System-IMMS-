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

type Program = {
  id: string;
  name: string;
  description?: string | null;
  capacity?: number | null;
  status: string;
  campusId: string;
  academicYearId: string;
  campus?: { id: string; name: string; shortName: string };
  academicYear?: { id: string; name: string };
};

type Option = { id: string; name: string; shortName?: string };

export default function ProgramsPage() {
  const router = useRouter();
  const { push } = useToast();
  const [items, setItems] = useState<Program[]>([]);
  const [campuses, setCampuses] = useState<Option[]>([]);
  const [years, setYears] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Program | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    capacity: '',
    campusId: '',
    academicYearId: '',
    status: 'ACTIVE',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Program | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  async function load() {
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    setLoading(true);
    setError('');
    try {
      const [programs, campusList, yearList] = await Promise.all([
        api<Program[]>(`/programs${q}`),
        api<Option[]>(`/campuses${q}`),
        api<Option[]>(`/academic-years${q}`),
      ]);
      setItems(Array.isArray(programs) ? programs : []);
      setCampuses(Array.isArray(campusList) ? campusList : []);
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
    setForm({
      name: '',
      description: '',
      capacity: '',
      campusId: campuses[0]?.id ?? '',
      academicYearId: years[0]?.id ?? '',
      status: 'ACTIVE',
    });
    setModal('create');
  }

  function openEdit(p: Program) {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? '',
      capacity: p.capacity != null ? String(p.capacity) : '',
      campusId: p.campusId,
      academicYearId: p.academicYearId,
      status: p.status,
    });
    setModal('edit');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const orgId = getActiveOrganizationId();
    setSaving(true);
    try {
      if (modal === 'create') {
        await api('/programs', {
          method: 'POST',
          body: JSON.stringify({
            organizationId: orgId,
            name: form.name.trim(),
            campusId: form.campusId,
            academicYearId: form.academicYearId,
            description: form.description.trim() || undefined,
            capacity: form.capacity ? Number(form.capacity) : undefined,
          }),
        });
        push({ kind: 'success', title: 'Program created' });
      } else if (editing) {
        await api(`/programs/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            capacity: form.capacity ? Number(form.capacity) : undefined,
            status: form.status,
          }),
        });
        push({ kind: 'success', title: 'Program updated' });
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
      await api(`/programs/${deleting.id}/archive`, { method: 'POST' });
      push({ kind: 'success', title: 'Program archived' });
      setDeleting(null);
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Archive failed',
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
          <h1 className="page-title">Programs</h1>
          <p className="page-sub">Training tracks under campuses and academic years.</p>
        </div>
        <AddButton onClick={openCreate} label="Add" disabled={!campuses.length || !years.length} />
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No programs yet"
          description={
            !campuses.length || !years.length
              ? 'Create a campus and academic year first.'
              : 'Add a program to assign students.'
          }
          actionLabel={campuses.length && years.length ? 'Add' : undefined}
          onAction={campuses.length && years.length ? openCreate : undefined}
        />
      ) : (
        <div className="table-wrap">
          <table className="table zebra">
            <thead>
              <tr>
                <th>Program</th>
                <th>Campus</th>
                <th>Year</th>
                <th>Capacity</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td>{p.campus?.shortName ?? '—'}</td>
                  <td>{p.academicYear?.name ?? '—'}</td>
                  <td>{p.capacity ?? '—'}</td>
                  <td>
                    <StatusChip tone={p.status === 'ACTIVE' ? 'success' : 'warning'}>{p.status}</StatusChip>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(p)}>
                        <Pencil size={14} strokeWidth={1.75} aria-hidden />
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(p)}>
                        <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                        Archive
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
        title={modal === 'create' ? 'Add program' : 'Edit program'}
        onClose={() => setModal(null)}
      >
        <form onSubmit={onSave} style={{ display: 'grid', gap: 12 }}>
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          {modal === 'create' ? (
            <>
              <label className="field">
                Campus
                <select
                  className="select"
                  value={form.campusId}
                  onChange={(e) => setForm((f) => ({ ...f, campusId: e.target.value }))}
                  required
                >
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.shortName ?? c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Academic year
                <select
                  className="select"
                  value={form.academicYearId}
                  onChange={(e) => setForm((f) => ({ ...f, academicYearId: e.target.value }))}
                  required
                >
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="field">
              Status
              <select
                className="select"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </label>
          )}
          <Input
            label="Capacity"
            type="number"
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
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
        title="Archive program?"
        message={deleting ? `Archive “${deleting.name}”? It will be hidden from active lists.` : ''}
        confirmLabel="Archive"
        loading={busyDelete}
        onConfirm={() => void onDelete()}
        onClose={() => setDeleting(null)}
      />
    </AppShell>
  );
}
