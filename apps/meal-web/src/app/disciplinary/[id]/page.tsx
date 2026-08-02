'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/providers/ToastProvider';
import { api, getActiveOrganizationId } from '@/lib/api';
import {
  formatIncidentWhen,
  incidentStatusLabel,
  incidentStatusTone,
  severityTone,
  type DisciplinaryActionType,
  type DisciplinaryIncident,
} from '@/lib/disciplinary';
import {
  canDecideDisciplinary,
  canInvestigateDisciplinary,
  readStoredUser,
} from '@/lib/rbac';

export default function DisciplinaryDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { push } = useToast();
  const id = params?.id ?? '';

  const [incident, setIncident] = useState<DisciplinaryIncident | null>(null);
  const [actionTypes, setActionTypes] = useState<DisciplinaryActionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [canInvestigate, setCanInvestigate] = useState(false);
  const [canDecide, setCanDecide] = useState(false);
  const [notes, setNotes] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [actionTypeId, setActionTypeId] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api<DisciplinaryIncident>(`/disciplinary-incidents/${id}`);
      setIncident(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load case');
      setIncident(null);
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
    const user = readStoredUser();
    setCanInvestigate(canInvestigateDisciplinary(user));
    setCanDecide(canDecideDisciplinary(user));
  }, [router]);

  useEffect(() => {
    if (!id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!canDecide) return;
    const orgId = getActiveOrganizationId();
    const qs = new URLSearchParams({
      activeOnly: 'true',
      ...(orgId ? { organizationId: orgId } : {}),
    });
    api<DisciplinaryActionType[]>(`/disciplinary-action-types?${qs}`)
      .then((data) => {
        const rows = Array.isArray(data) ? data : [];
        setActionTypes(rows);
        if (rows[0]) setActionTypeId(rows[0]!.id);
      })
      .catch(() => setActionTypes([]));
  }, [canDecide]);

  async function runAction(
    path: string,
    body?: Record<string, unknown>,
    success = 'Updated',
  ) {
    setBusy(true);
    try {
      const data = await api<DisciplinaryIncident>(`/disciplinary-incidents/${id}/${path}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      setIncident(data);
      setNotes('');
      push({ kind: 'success', title: success, message: data.incidentNumber });
    } catch (err) {
      push({
        kind: 'error',
        title: 'Action failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setBusy(false);
    }
  }

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    if (!actionTypeId) return;
    setBusy(true);
    try {
      const data = await api<DisciplinaryIncident>(
        `/disciplinary-incidents/${id}/assign-action`,
        {
          method: 'POST',
          body: JSON.stringify({
            actionTypeId,
            description: actionDescription || undefined,
            decisionNotes: decisionNotes || undefined,
          }),
        },
      );
      setIncident(data);
      setAssignOpen(false);
      setActionDescription('');
      setDecisionNotes('');
      push({ kind: 'success', title: 'Action assigned', message: data.incidentNumber });
    } catch (err) {
      push({
        kind: 'error',
        title: 'Assign failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setBusy(false);
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
          <h1 className="page-title">
            {incident?.incidentNumber ?? 'Disciplinary case'}
          </h1>
          <p className="page-sub">Full case record from report through resolution.</p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 12 }}>
          <Skeleton height={48} />
          <Skeleton height={160} />
        </div>
      ) : !incident ? (
        <EmptyState
          title="Case not found"
          actionLabel="Back to list"
          onAction={() => router.push('/disciplinary')}
        />
      ) : (
        <div className="profile-page">
          <section className="panel">
            <div className="meal-chips" style={{ marginBottom: 12 }}>
              <StatusChip tone={incidentStatusTone(incident.status)}>
                {incidentStatusLabel(incident.status)}
              </StatusChip>
              <StatusChip tone={severityTone(incident.severity)}>
                {incident.severity}
              </StatusChip>
              <StatusChip tone="info">
                {incident.incidentType?.category} · {incident.incidentType?.name}
              </StatusChip>
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem' }}>
              {incident.student?.fullName}
            </h2>
            <p className="muted" style={{ marginTop: 0 }}>
              {incident.student?.studentId}
              {incident.campus?.shortName ? ` · ${incident.campus.shortName}` : ''}
              {incident.program?.name ? ` · ${incident.program.name}` : ''}
            </p>
            <div className="gate-pass-grid" style={{ marginTop: 16 }}>
              <div>
                <span className="muted">Occurred</span>
                <strong>{formatIncidentWhen(incident.occurredAt)}</strong>
              </div>
              <div>
                <span className="muted">Location</span>
                <strong>{incident.location || '—'}</strong>
              </div>
              <div>
                <span className="muted">Reported by</span>
                <strong>{incident.reportedBy?.fullName ?? '—'}</strong>
              </div>
              <div>
                <span className="muted">Assigned to</span>
                <strong>{incident.assignedTo?.fullName ?? '—'}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <h3 className="profile-section-title">Description</h3>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{incident.description}</p>
            {incident.witnesses ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                Witnesses: {incident.witnesses}
              </p>
            ) : null}
            {incident.evidenceUrl ? (
              <p style={{ marginBottom: 0 }}>
                Evidence:{' '}
                <a href={incident.evidenceUrl} target="_blank" rel="noreferrer">
                  {incident.evidenceUrl}
                </a>
              </p>
            ) : null}
          </section>

          {(incident.investigationNotes || incident.decisionNotes) && (
            <section className="panel">
              <h3 className="profile-section-title">Case notes</h3>
              {incident.investigationNotes ? (
                <>
                  <strong>Investigation</strong>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{incident.investigationNotes}</p>
                </>
              ) : null}
              {incident.decisionNotes ? (
                <>
                  <strong>Decision</strong>
                  <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                    {incident.decisionNotes}
                  </p>
                </>
              ) : null}
            </section>
          )}

          <section className="panel">
            <h3 className="profile-section-title">Disciplinary actions</h3>
            {!incident.actions?.length ? (
              <p className="muted" style={{ margin: 0 }}>
                No action assigned yet.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table zebra">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Status</th>
                      <th>Assigned by</th>
                      <th>Window</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incident.actions.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.actionType?.name ?? '—'}</strong>
                          {a.description ? (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>
                              {a.description}
                            </div>
                          ) : null}
                        </td>
                        <td>{a.status}</td>
                        <td>{a.assignedBy?.fullName ?? '—'}</td>
                        <td className="muted">
                          {a.startDate ? formatIncidentWhen(a.startDate) : '—'}
                          {a.endDate ? ` → ${formatIncidentWhen(a.endDate)}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {(canInvestigate || canDecide) && incident.status !== 'CLOSED' ? (
            <section className="panel" style={{ display: 'grid', gap: 12 }}>
              <h3 className="profile-section-title">Workflow</h3>
              <label className="field">
                <span>Notes (optional)</span>
                <textarea
                  className="input"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Investigation or decision notes"
                />
              </label>
              <div className="dash-head-actions">
                {canInvestigate &&
                (incident.status === 'OPEN' || incident.status === 'APPEALED') ? (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void runAction('investigate', { notes }, 'Investigation started')
                    }
                  >
                    Start investigation
                  </Button>
                ) : null}
                {canInvestigate && incident.status === 'UNDER_INVESTIGATION' ? (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void runAction('submit-decision', { notes }, 'Submitted for decision')
                    }
                  >
                    Submit for decision
                  </Button>
                ) : null}
                {canDecide ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setAssignOpen(true)}
                  >
                    Assign action
                  </Button>
                ) : null}
                {canDecide &&
                (incident.status === 'ACTION_ASSIGNED' ||
                  incident.status === 'AWAITING_DECISION' ||
                  incident.status === 'APPEALED') ? (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void runAction('close', { notes }, 'Case closed')}
                  >
                    Close case
                  </Button>
                ) : null}
                {canDecide &&
                (incident.status === 'ACTION_ASSIGNED' || incident.status === 'CLOSED') ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void runAction('appeal', { notes }, 'Appeal opened')}
                  >
                    Mark appealed
                  </Button>
                ) : null}
                {incident.status === 'ACTION_ASSIGNED' && !incident.acknowledgedAt ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void runAction('acknowledge', { notes }, 'Acknowledgment recorded')
                    }
                  >
                    Record acknowledgment
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign disciplinary action">
        <form onSubmit={onAssign} style={{ display: 'grid', gap: 12 }}>
          <label className="field">
            <span>Action type</span>
            <select
              className="select"
              value={actionTypeId}
              onChange={(e) => setActionTypeId(e.target.value)}
              required
            >
              {actionTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.affectsMeals ? ' (meal alert)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Action details</span>
            <Input
              value={actionDescription}
              onChange={(e) => setActionDescription(e.target.value)}
              placeholder="Optional details"
            />
          </label>
          <label className="field">
            <span>Decision notes</span>
            <textarea
              className="input"
              rows={3}
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
            />
          </label>
          <div className="dash-head-actions">
            <Button type="button" variant="secondary" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !actionTypeId}>
              Assign
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
