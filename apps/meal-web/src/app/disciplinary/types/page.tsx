'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/providers/ToastProvider';
import { api, getActiveOrganizationId } from '@/lib/api';
import type { DisciplinaryActionType, IncidentType } from '@/lib/disciplinary';
import { canManageDisciplinaryTypes, readStoredUser } from '@/lib/rbac';

export default function DisciplinaryTypesPage() {
  const router = useRouter();
  const { push } = useToast();
  const [incidentTypes, setIncidentTypes] = useState<IncidentType[]>([]);
  const [actionTypes, setActionTypes] = useState<DisciplinaryActionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [incidentForm, setIncidentForm] = useState({
    category: 'Behavior',
    name: '',
    description: '',
  });
  const [actionForm, setActionForm] = useState({
    name: '',
    description: '',
    affectsMeals: false,
  });

  async function load() {
    const orgId = getActiveOrganizationId();
    const qs = orgId ? `?organizationId=${orgId}` : '';
    setLoading(true);
    try {
      const [i, a] = await Promise.all([
        api<IncidentType[]>(`/incident-types${qs}`),
        api<DisciplinaryActionType[]>(`/disciplinary-action-types${qs}`),
      ]);
      setIncidentTypes(Array.isArray(i) ? i : []);
      setActionTypes(Array.isArray(a) ? a : []);
    } catch (err) {
      push({
        kind: 'error',
        title: 'Failed to load types',
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
    if (!canManageDisciplinaryTypes(readStoredUser())) {
      router.replace('/disciplinary');
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function createIncidentType(e: FormEvent) {
    e.preventDefault();
    const orgId = getActiveOrganizationId();
    if (!orgId) return;
    try {
      await api('/incident-types', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: orgId,
          category: incidentForm.category.trim(),
          name: incidentForm.name.trim(),
          description: incidentForm.description || undefined,
        }),
      });
      setIncidentForm({ category: 'Behavior', name: '', description: '' });
      push({ kind: 'success', title: 'Incident type added' });
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Could not add type',
        message: err instanceof Error ? err.message : 'Try again',
      });
    }
  }

  async function createActionType(e: FormEvent) {
    e.preventDefault();
    const orgId = getActiveOrganizationId();
    if (!orgId) return;
    try {
      await api('/disciplinary-action-types', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: orgId,
          name: actionForm.name.trim(),
          description: actionForm.description || undefined,
          affectsMeals: actionForm.affectsMeals,
        }),
      });
      setActionForm({ name: '', description: '', affectsMeals: false });
      push({ kind: 'success', title: 'Action type added' });
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Could not add action',
        message: err instanceof Error ? err.message : 'Try again',
      });
    }
  }

  async function toggleIncident(type: IncidentType) {
    try {
      await api(`/incident-types/${type.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !type.active }),
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

  async function toggleAction(type: DisciplinaryActionType) {
    try {
      await api(`/disciplinary-action-types/${type.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !type.active }),
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
          <Link href="/disciplinary" className="profile-back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Disciplinary cases
          </Link>
          <h1 className="page-title">Incident & action types</h1>
          <p className="page-sub">Configure categories and disciplinary outcomes for your camp.</p>
        </div>
      </div>

      {loading ? (
        <div className="panel">
          <Skeleton height={200} />
        </div>
      ) : (
        <div className="profile-grid">
          <section className="panel" style={{ display: 'grid', gap: 14 }}>
            <h3 className="profile-section-title">Incident types</h3>
            <form onSubmit={createIncidentType} style={{ display: 'grid', gap: 10 }}>
              <Input
                value={incidentForm.category}
                onChange={(e) => setIncidentForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Category"
                required
              />
              <Input
                value={incidentForm.name}
                onChange={(e) => setIncidentForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Type name"
                required
              />
              <Button type="submit">Add incident type</Button>
            </form>
            {!incidentTypes.length ? (
              <EmptyState title="No incident types" />
            ) : (
              <ul className="profile-bars">
                {incidentTypes.map((t) => (
                  <li key={t.id}>
                    <div className="profile-bar-label">
                      <strong>
                        {t.category} · {t.name}
                      </strong>
                      <Button type="button" size="sm" variant="secondary" onClick={() => void toggleIncident(t)}>
                        {t.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                    <StatusChip tone={t.active ? 'success' : 'warning'}>
                      {t.active ? 'Active' : 'Inactive'}
                    </StatusChip>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" style={{ display: 'grid', gap: 14 }}>
            <h3 className="profile-section-title">Disciplinary actions</h3>
            <form onSubmit={createActionType} style={{ display: 'grid', gap: 10 }}>
              <Input
                value={actionForm.name}
                onChange={(e) => setActionForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Action name"
                required
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={actionForm.affectsMeals}
                  onChange={(e) =>
                    setActionForm((f) => ({ ...f, affectsMeals: e.target.checked }))
                  }
                />
                Show meal-station alert when active
              </label>
              <Button type="submit">Add action type</Button>
            </form>
            {!actionTypes.length ? (
              <EmptyState title="No action types" />
            ) : (
              <ul className="profile-bars">
                {actionTypes.map((t) => (
                  <li key={t.id}>
                    <div className="profile-bar-label">
                      <strong>{t.name}</strong>
                      <Button type="button" size="sm" variant="secondary" onClick={() => void toggleAction(t)}>
                        {t.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                    <div className="meal-chips">
                      <StatusChip tone={t.active ? 'success' : 'warning'}>
                        {t.active ? 'Active' : 'Inactive'}
                      </StatusChip>
                      {t.affectsMeals ? <StatusChip tone="info">Meal alert</StatusChip> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
