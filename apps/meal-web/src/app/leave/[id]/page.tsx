'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Ban, Check, Printer, X } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { PrintableBarcode } from '@/components/gate-pass/PrintableBarcode';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { api } from '@/lib/api';
import {
  formatLeaveDateTime,
  leaveStatusLabel,
  leaveStatusTone,
  type LeaveRequest,
} from '@/lib/leave';
import { canApproveLeave, readStoredUser } from '@/lib/rbac';

export default function LeaveDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { push } = useToast();

  const [leave, setLeave] = useState<LeaveRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canApprove, setCanApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<LeaveRequest>(`/leave-requests/${id}`);
      setLeave(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leave');
      setLeave(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }
    setCanApprove(canApproveLeave(readStoredUser()));
    void load();
  }, [router, load]);

  async function onApprove() {
    if (!leave) return;
    setBusy(true);
    try {
      await api(`/leave-requests/${leave.id}/approve`, { method: 'POST' });
      push({ kind: 'success', title: 'Leave approved' });
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Approve failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setBusy(false);
    }
  }

  async function onReject(e: FormEvent) {
    e.preventDefault();
    if (!leave) return;
    if (rejectReason.trim().length < 2) {
      push({ kind: 'error', title: 'Reason required' });
      return;
    }
    setBusy(true);
    try {
      await api(`/leave-requests/${leave.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      push({ kind: 'success', title: 'Leave rejected' });
      setRejectOpen(false);
      setRejectReason('');
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Reject failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!leave) return;
    setBusy(true);
    try {
      await api(`/leave-requests/${leave.id}/cancel`, { method: 'POST' });
      push({ kind: 'success', title: 'Leave cancelled' });
      setCancelOpen(false);
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Cancel failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setBusy(false);
    }
  }

  const pending = leave?.status === 'PENDING';
  const canCancel =
    leave?.status === 'PENDING' || leave?.status === 'APPROVED';

  return (
    <AppShell>
      <div className="page-head no-print">
        <div>
          <Link href="/leave" className="profile-back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Leave Requests
          </Link>
          <h1 className="page-title">Leave details</h1>
          <p className="page-sub">Gate pass view and approval actions.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/leave/print?ids=${leave?.id ?? id}&layout=8`}>
            <Button type="button" variant="secondary">
              <Printer size={15} strokeWidth={1.75} aria-hidden />
              Print / PDF
            </Button>
          </Link>
          <Link href={`/leave/print?ids=${leave?.id ?? id}&layout=1`}>
            <Button type="button" variant="ghost">
              Single card
            </Button>
          </Link>
          {pending && canApprove ? (
            <>
              <Button type="button" disabled={busy} onClick={() => void onApprove()}>
                <Check size={15} strokeWidth={1.75} aria-hidden />
                Approve
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setRejectReason('');
                  setRejectOpen(true);
                }}
              >
                <X size={15} strokeWidth={1.75} aria-hidden />
                Reject
              </Button>
            </>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setCancelOpen(true)}
            >
              <Ban size={15} strokeWidth={1.75} aria-hidden />
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="error no-print">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 12 }}>
          <Skeleton height={48} />
          <Skeleton height={160} />
        </div>
      ) : !leave ? (
        <EmptyState
          title="Leave not found"
          actionLabel="Back to leave"
          onAction={() => router.push('/leave')}
        />
      ) : (
        <div className="leave-detail">
          <section className="panel gate-pass" aria-label="Gate pass">
            <div className="gate-pass-head">
              <div>
                <p className="gate-pass-kicker">INSA · Gate Pass</p>
                <h2>{leave.leaveNumber}</h2>
              </div>
              <StatusChip tone={leaveStatusTone(leave.status)}>
                {leaveStatusLabel(leave.status)}
              </StatusChip>
            </div>
            <div className="gate-pass-grid">
              <div>
                <span className="muted">Student</span>
                <strong>{leave.student?.fullName ?? '—'}</strong>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {leave.student?.studentId}
                </div>
              </div>
              <div>
                <span className="muted">Barcode</span>
                {(leave.student?.barcode ?? leave.student?.studentId) ? (
                  <PrintableBarcode
                    value={leave.student?.barcode || leave.student?.studentId || ''}
                    className="gpc-barcode-svg"
                    height={40}
                  />
                ) : (
                  <strong>—</strong>
                )}
              </div>
              <div>
                <span className="muted">Gate verification</span>
                <strong>
                  {leave.status === 'CHECKED_OUT' || leave.status === 'OVERDUE'
                    ? 'Exit verified at gate'
                    : leave.status === 'RETURNED'
                      ? 'Return verified at gate'
                      : leave.status === 'APPROVED'
                        ? 'Approved — waiting for gate scan'
                        : leaveStatusLabel(leave.status)}
                </strong>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  Scan at Gate Scanner (/gate) using student barcode or leave number
                </div>
              </div>
              <div>
                <span className="muted">Leave type</span>
                <strong>{leave.leaveType?.name ?? '—'}</strong>
              </div>
              <div>
                <span className="muted">Destination</span>
                <strong>{leave.destination}</strong>
              </div>
              <div>
                <span className="muted">Expected return</span>
                <strong>{formatLeaveDateTime(leave.expectedReturnTime)}</strong>
              </div>
              <div>
                <span className="muted">Campus / Program</span>
                <strong>
                  {leave.campus?.shortName ?? leave.campus?.name ?? '—'}
                  {leave.program?.name ? ` · ${leave.program.name}` : ''}
                </strong>
              </div>
            </div>
          </section>

          <section className="panel no-print" style={{ marginTop: 14 }}>
            <h3 className="profile-section-title">Request details</h3>
            <div className="gate-pass-grid" style={{ marginTop: 12 }}>
              <div>
                <span className="muted">Reason</span>
                <strong>{leave.reason}</strong>
              </div>
              <div>
                <span className="muted">Expected exit</span>
                <strong>{formatLeaveDateTime(leave.expectedExitTime)}</strong>
              </div>
              <div>
                <span className="muted">Created by</span>
                <strong>{leave.createdBy?.fullName ?? '—'}</strong>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  {formatLeaveDateTime(leave.createdAt)}
                </div>
              </div>
              <div>
                <span className="muted">Approved by</span>
                <strong>{leave.approvedBy?.fullName ?? '—'}</strong>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  {leave.approvedAt ? formatLeaveDateTime(leave.approvedAt) : '—'}
                </div>
              </div>
              <div>
                <span className="muted">Actual exit</span>
                <strong>{formatLeaveDateTime(leave.actualExitTime)}</strong>
              </div>
              <div>
                <span className="muted">Actual return</span>
                <strong>{formatLeaveDateTime(leave.actualReturnTime)}</strong>
              </div>
              {leave.notes ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span className="muted">Notes</span>
                  <strong>{leave.notes}</strong>
                </div>
              ) : null}
              {leave.rejectionReason ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span className="muted">Rejection reason</span>
                  <strong>{leave.rejectionReason}</strong>
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel no-print" style={{ marginTop: 14 }}>
            <h3 className="profile-section-title">Gate logs</h3>
            {!leave.gateLogs?.length ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                No gate scans yet.
              </p>
            ) : (
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="table zebra">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>When</th>
                      <th>Location</th>
                      <th>Officer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leave.gateLogs.map((g) => (
                      <tr key={g.id}>
                        <td>
                          <StatusChip tone={g.action === 'EXIT' ? 'info' : 'success'}>
                            {g.action}
                          </StatusChip>
                        </td>
                        <td>{formatLeaveDateTime(g.scannedAt)}</td>
                        <td>{g.gateLocation ?? '—'}</td>
                        <td>{g.gateOfficer?.fullName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      <Modal open={rejectOpen} title="Reject leave request" onClose={() => setRejectOpen(false)}>
        <form onSubmit={onReject} style={{ display: 'grid', gap: 12 }}>
          <label className="field">
            <span>Reason</span>
            <textarea
              className="input"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setRejectOpen(false)}>
              Close
            </Button>
            <Button type="submit" loading={busy}>
              Reject
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel leave?"
        message={leave ? `Cancel leave ${leave.leaveNumber}?` : ''}
        loading={busy}
        onConfirm={() => void onCancel()}
        onClose={() => setCancelOpen(false)}
      />
    </AppShell>
  );
}
