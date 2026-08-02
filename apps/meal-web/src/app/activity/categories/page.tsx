'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { AddButton } from '@/components/ui/AddButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/providers/ToastProvider';
import { api, getActiveOrganizationId } from '@/lib/api';
import { type ActivityCategory } from '@/lib/activity';
import { canManageActivityCategories, readStoredUser } from '@/lib/rbac';

export default function ActivityCategoriesPage() {
  const router = useRouter();
  const { push } = useToast();
  const [items, setItems] = useState<ActivityCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityCategory | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const orgId = getActiveOrganizationId();
    const qs = orgId ? `?organizationId=${orgId}` : '';
    setLoading(true);
    try {
      const data = await api<ActivityCategory[]>(`/activity-categories${qs}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      push({
        kind: 'error',
        title: 'Failed to load categories',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }
    if (!canManageActivityCategories(readStoredUser())) {
      router.replace('/activity');
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function openCreate() {
    setEditing(null);
    setName('');
    setDescription('');
    setOpen(true);
  }

  function openEdit(row: ActivityCategory) {
    setEditing(row);
    setName(row.name);
    setDescription(row.description ?? '');
    setOpen(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const orgId = getActiveOrganizationId();
    if (!orgId) return;
    setBusy(true);
    try {
      if (editing) {
        await api(`/activity-categories/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: name.trim(), description: description || undefined }),
        });
      } else {
        await api('/activity-categories', {
          method: 'POST',
          body: JSON.stringify({
            organizationId: orgId,
            name: name.trim(),
            description: description || undefined,
          }),
        });
      }
      setOpen(false);
      push({ kind: 'success', title: editing ? 'Category updated' : 'Category created' });
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: ActivityCategory) {
    try {
      await api(`/activity-categories/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !row.active }),
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
          <Link href="/activity" className="profile-back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Activity reports
          </Link>
          <h1 className="page-title">Activity categories</h1>
          <p className="page-sub">Configure report categories used across all campuses.</p>
        </div>
        <AddButton label="Add category" onClick={openCreate} />
      </div>

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No categories" actionLabel="Add category" onAction={openCreate} />
      ) : (
        <div className="table-wrap panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td className="muted">{row.description || '—'}</td>
                  <td>{row.active ? 'Active' : 'Inactive'}</td>
                  <td>
                    <div className="form-actions">
                      <Button type="button" variant="ghost" onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => void toggleActive(row)}>
                        {row.active ? 'Deactivate' : 'Activate'}
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
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit category' : 'New category'}
      >
        <form onSubmit={onSave} style={{ display: 'grid', gap: 12 }}>
          <label className="field">
            <span>Name</span>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              className="textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
