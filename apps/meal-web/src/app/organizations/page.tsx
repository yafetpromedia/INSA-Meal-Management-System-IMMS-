'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { AddButton } from '@/components/ui/AddButton';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/providers/ToastProvider';
import { api } from '@/lib/api';

type Org = {
  id: string;
  code: string;
  name: string;
  status: string;
  timezone?: string;
  locale?: string;
  description?: string | null;
};

const emptyForm = { code: '', name: '', timezone: 'Africa/Addis_Ababa', locale: 'en', description: '', status: 'ACTIVE' };

export default function OrganizationsPage() {
  const router = useRouter();
  const { push } = useToast();
  const [items, setItems] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Org | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api<Org[]>('/organizations');
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
    setForm(emptyForm);
    setModal('create');
  }

  function openEdit(o: Org) {
    setEditing(o);
    setForm({
      code: o.code,
      name: o.name,
      timezone: o.timezone ?? 'Africa/Addis_Ababa',
      locale: o.locale ?? 'en',
      description: o.description ?? '',
      status: o.status,
    });
    setModal('edit');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === 'create') {
        await api('/organizations', {
          method: 'POST',
          body: JSON.stringify({
            code: form.code.trim(),
            name: form.name.trim(),
            timezone: form.timezone || undefined,
            locale: form.locale || undefined,
            description: form.description || undefined,
          }),
        });
        push({ kind: 'success', title: 'Organization created' });
      } else if (editing) {
        await api(`/organizations/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            timezone: form.timezone || undefined,
            locale: form.locale || undefined,
            description: form.description || undefined,
            status: form.status,
          }),
        });
        push({ kind: 'success', title: 'Organization updated' });
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

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="page-title">Organizations</h1>
          <p className="page-sub">Tenant organizations for multi-institution deployments.</p>
        </div>
        <AddButton onClick={openCreate} label="Add" />
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={36} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No organizations" actionLabel="Add" onAction={openCreate} />
      ) : (
        <div className="table-wrap">
          <table className="table zebra">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Timezone</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td>
                    <code style={{ fontSize: '0.8125rem' }}>{o.code}</code>
                  </td>
                  <td style={{ fontWeight: 500 }}>{o.name}</td>
                  <td className="muted">{o.timezone ?? '—'}</td>
                  <td>
                    <StatusChip tone={o.status === 'ACTIVE' ? 'success' : 'warning'}>{o.status}</StatusChip>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(o)}>
                        <Pencil size={14} strokeWidth={1.75} aria-hidden />
                        Edit
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
        title={modal === 'create' ? 'Add organization' : 'Edit organization'}
        onClose={() => setModal(null)}
      >
        <form onSubmit={onSave} style={{ display: 'grid', gap: 12 }}>
          <Input
            label="Code"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            required
            disabled={modal === 'edit'}
          />
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label="Timezone"
            value={form.timezone}
            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
          />
          <Input
            label="Locale"
            value={form.locale}
            onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))}
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          {modal === 'edit' ? (
            <label className="field">
              <span className="field-label">Status</span>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
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
    </AppShell>
  );
}
