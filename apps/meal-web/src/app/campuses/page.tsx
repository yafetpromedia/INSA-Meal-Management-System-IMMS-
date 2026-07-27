'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Pencil, Search, Trash2 } from 'lucide-react';
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

type Campus = {
  id: string;
  name: string;
  shortName: string;
  address?: string | null;
  city?: string | null;
  location?: string | null;
  description?: string | null;
  status: string;
  organization?: { code: string; name: string };
};

const emptyForm = { name: '', shortName: '', city: '', address: '', description: '' };

function formatCampusLocation(c: {
  city?: string | null;
  address?: string | null;
  location?: string | null;
}) {
  const city = c.city?.trim() ?? '';
  const address = c.address?.trim() ?? '';
  const location = c.location?.trim() ?? '';

  if (city && address) {
    const addr = address.toLowerCase();
    const cityL = city.toLowerCase();
    if (addr === cityL || addr.startsWith(`${cityL},`) || addr.startsWith(`${cityL} `)) {
      return address;
    }
    return `${city} · ${address}`;
  }
  return city || address || location || '—';
}

export default function CampusesPage() {
  const router = useRouter();
  const { push } = useToast();
  const [items, setItems] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Campus | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Campus | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  async function load(q = search) {
    const orgId = getActiveOrganizationId();
    const qs = new URLSearchParams({
      ...(orgId ? { organizationId: orgId } : {}),
      ...(q ? { search: q } : {}),
    });
    setLoading(true);
    setError('');
    try {
      const data = await api<Campus[]>(`/campuses?${qs}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campuses');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    void load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModal('create');
  }

  function openEdit(c: Campus) {
    setEditing(c);
    setForm({
      name: c.name,
      shortName: c.shortName,
      city: c.city ?? '',
      address: c.address ?? '',
      description: c.description ?? '',
    });
    setModal('edit');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const orgId = getActiveOrganizationId();
    if (!orgId && modal === 'create') {
      push({ kind: 'error', title: 'No organization selected' });
      return;
    }
    setSaving(true);
    try {
      if (modal === 'create') {
        await api('/campuses', {
          method: 'POST',
          body: JSON.stringify({
            organizationId: orgId,
            name: form.name.trim(),
            shortName: form.shortName.trim().toUpperCase(),
            city: form.city.trim() || undefined,
            address: form.address.trim() || undefined,
            description: form.description.trim() || undefined,
          }),
        });
        push({ kind: 'success', title: 'Campus created' });
      } else if (editing) {
        await api(`/campuses/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            shortName: form.shortName.trim().toUpperCase(),
            city: form.city.trim() || undefined,
            address: form.address.trim() || undefined,
            description: form.description.trim() || undefined,
          }),
        });
        push({ kind: 'success', title: 'Campus updated' });
      }
      setModal(null);
      await load(search);
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
      await api(`/campuses/${deleting.id}`, { method: 'DELETE' });
      push({ kind: 'success', title: 'Campus deleted' });
      setDeleting(null);
      await load(search);
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
          <h1 className="page-title">Campuses</h1>
          <p className="page-sub">Training locations for meal distribution.</p>
        </div>
        <AddButton onClick={openCreate} label="Add" />
      </div>

      <form
        className="panel"
        style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft.trim());
          void load(draft.trim());
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search
            size={16}
            strokeWidth={1.75}
            aria-hidden
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}
          />
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search by name or short code…"
            aria-label="Search campuses"
            style={{ paddingLeft: 36, width: '100%' }}
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={40} />
          <Skeleton height={40} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No campuses yet"
          description="Add a campus to start assigning programs and students."
          actionLabel="Add"
          onAction={openCreate}
        />
      ) : (
        <div className="table-wrap">
          <table className="table zebra">
            <thead>
              <tr>
                <th>Campus</th>
                <th>Code</th>
                <th>Location</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    {c.description ? (
                      <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                        {c.description}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <code style={{ fontSize: '0.8125rem' }}>{c.shortName}</code>
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={14} strokeWidth={1.75} className="muted" aria-hidden />
                      {formatCampusLocation(c)}
                    </span>
                  </td>
                  <td>
                    <StatusChip tone={c.status === 'ACTIVE' ? 'success' : 'warning'}>{c.status}</StatusChip>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(c)}>
                        <Pencil size={14} strokeWidth={1.75} aria-hidden />
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(c)}>
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
        title={modal === 'create' ? 'Add campus' : 'Edit campus'}
        onClose={() => setModal(null)}
      >
        <form onSubmit={onSave} style={{ display: 'grid', gap: 12 }}>
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label="Short name"
            value={form.shortName}
            onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
            required
          />
          <Input label="City" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
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
        title="Delete campus?"
        message={
          deleting
            ? `Soft-delete “${deleting.name}”? Campuses with active students cannot be deleted.`
            : ''
        }
        loading={busyDelete}
        onConfirm={() => void onDelete()}
        onClose={() => setDeleting(null)}
      />
    </AppShell>
  );
}
