'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Check, X, Ban, Printer, FileSpreadsheet } from 'lucide-react';
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
import { api, apiWithMeta, getActiveOrganizationId } from '@/lib/api';
import {
  formatLeaveDateTime,
  leaveStatusLabel,
  leaveStatusTone,
  type LeaveRequest,
} from '@/lib/leave';
import { canApproveLeave, readStoredUser } from '@/lib/rbac';

const PRINTABLE = new Set(['APPROVED', 'CHECKED_OUT', 'OVERDUE', 'RETURNED']);

const STATUSES = [
  '',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CHECKED_OUT',
  'RETURNED',
  'OVERDUE',
  'CANCELLED',
  'EXPIRED',
] as const;

export default function LeaveRequestsPage() {
  const router = useRouter();
  const { push } = useToast();
  const [items, setItems] = useState<LeaveRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canApprove, setCanApprove] = useState(false);
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const limit = 20;

  async function load() {
    const orgId = getActiveOrganizationId();
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(orgId ? { organizationId: orgId } : {}),
      ...(status ? { status } : {}),
    });
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await apiWithMeta<LeaveRequest[]>(`/leave-requests?${qs}`);
      const rows = Array.isArray(data) ? data : [];
      setItems(rows);
      setTotal(Number(meta.total ?? rows.length));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leave requests');
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
    setCanApprove(canApproveLeave(readStoredUser()));
  }, [router]);

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = draft.trim();
      if (next === q) return;
      setQ(next);
    }, 250);
    return () => window.clearTimeout(t);
  }, [draft, q]);

  const filtered = useMemo(() => {
    if (!q) return items;
    const needle = q.toLowerCase();
    return items.filter((row) => {
      const hay = [
        row.leaveNumber,
        row.destination,
        row.status,
        row.student?.fullName,
        row.student?.studentId,
        row.leaveType?.name,
        row.createdBy?.fullName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q]);

  async function onApprove(row: LeaveRequest) {
    setBusy(true);
    try {
      await api(`/leave-requests/${row.id}/approve`, { method: 'POST' });
      push({ kind: 'success', title: 'Leave approved', message: row.leaveNumber });
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
    if (!rejecting) return;
    if (rejectReason.trim().length < 2) {
      push({ kind: 'error', title: 'Reason required', message: 'Explain why this leave is rejected.' });
      return;
    }
    setBusy(true);
    try {
      await api(`/leave-requests/${rejecting.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      push({ kind: 'success', title: 'Leave rejected', message: rejecting.leaveNumber });
      setRejecting(null);
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
    if (!cancelling) return;
    setBusy(true);
    try {
      await api(`/leave-requests/${cancelling.id}/cancel`, { method: 'POST' });
      push({ kind: 'success', title: 'Leave cancelled', message: cancelling.leaveNumber });
      setCancelling(null);
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

  const pages = Math.max(1, Math.ceil(total / limit));
  const printableRows = filtered.filter((r) => PRINTABLE.has(r.status));
  const selectedIds = printableRows.filter((r) => selected[r.id]).map((r) => r.id);
  const allPrintableSelected =
    printableRows.length > 0 && printableRows.every((r) => selected[r.id]);

  function toggleAllPrintable() {
    if (allPrintableSelected) {
      setSelected((prev) => {
        const next = { ...prev };
        for (const r of printableRows) delete next[r.id];
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = { ...prev };
      for (const r of printableRows) next[r.id] = true;
      return next;
    });
  }

  function printSelected() {
    if (!selectedIds.length) {
      push({ kind: 'warning', title: 'Select approved passes first' });
      return;
    }
    router.push(`/leave/print?ids=${selectedIds.join(',')}&layout=8`);
  }

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="page-title">Leave Requests</h1>
          <p className="page-sub">Create, review, and track student leave & gate passes.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push('/leave/print?blank=1&layout=8&count=8')}
          >
            <FileSpreadsheet size={15} strokeWidth={1.75} aria-hidden />
            Blank templates
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!selectedIds.length}
            onClick={printSelected}
          >
            <Printer size={15} strokeWidth={1.75} aria-hidden />
            Print selected ({selectedIds.length})
          </Button>
          <AddButton label="Create" onClick={() => router.push('/leave/new')} />
        </div>
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ minWidth: 180, flex: '1 1 200px' }}>
          <Input
            label="Search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Leave #, student, destination…"
          />
        </div>
        <label className="field" style={{ minWidth: 160 }}>
          <span>Status</span>
          <select
            className="input"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All statuses</option>
            {STATUSES.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {leaveStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No leave requests"
          description="Create a leave request to issue a gate pass."
          actionLabel="Create leave"
          onAction={() => router.push('/leave/new')}
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table zebra">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all printable"
                      checked={allPrintableSelected}
                      onChange={toggleAllPrintable}
                      disabled={!printableRows.length}
                    />
                  </th>
                  <th>Leave #</th>
                  <th>Student</th>
                  <th>Type</th>
                  <th>Destination</th>
                  <th>Expected Exit</th>
                  <th>Expected Return</th>
                  <th>Status</th>
                  <th>Created By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const pending = row.status === 'PENDING';
                  const canCancel =
                    row.status === 'PENDING' || row.status === 'APPROVED';
                  const canPrint = PRINTABLE.has(row.status);
                  return (
                    <tr key={row.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.leaveNumber}`}
                          checked={Boolean(selected[row.id])}
                          disabled={!canPrint}
                          onChange={() =>
                            setSelected((prev) => ({
                              ...prev,
                              [row.id]: !prev[row.id],
                            }))
                          }
                        />
                      </td>
                      <td>
                        <Link href={`/leave/${row.id}`} className="table-link" style={{ fontWeight: 600 }}>
                          {row.leaveNumber}
                        </Link>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{row.student?.fullName ?? '—'}</div>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>
                          {row.student?.studentId}
                        </div>
                      </td>
                      <td>{row.leaveType?.name ?? '—'}</td>
                      <td>{row.destination}</td>
                      <td>{formatLeaveDateTime(row.expectedExitTime)}</td>
                      <td>{formatLeaveDateTime(row.expectedReturnTime)}</td>
                      <td>
                        <StatusChip tone={leaveStatusTone(row.status)}>
                          {leaveStatusLabel(row.status)}
                        </StatusChip>
                      </td>
                      <td>{row.createdBy?.fullName ?? '—'}</td>
                      <td>
                        <div className="row-actions">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/leave/${row.id}`)}
                          >
                            <Eye size={14} strokeWidth={1.75} aria-hidden />
                            View
                          </Button>
                          {canPrint ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                router.push(`/leave/print?ids=${row.id}&layout=8`)
                              }
                            >
                              <Printer size={14} strokeWidth={1.75} aria-hidden />
                              Print
                            </Button>
                          ) : null}
                          {pending && canApprove ? (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => void onApprove(row)}
                              >
                                <Check size={14} strokeWidth={1.75} aria-hidden />
                                Approve
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  setRejectReason('');
                                  setRejecting(row);
                                }}
                              >
                                <X size={14} strokeWidth={1.75} aria-hidden />
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {canCancel ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => setCancelling(row)}
                            >
                              <Ban size={14} strokeWidth={1.75} aria-hidden />
                              Cancel
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="muted" style={{ alignSelf: 'center', fontSize: '0.85rem' }}>
                Page {page} of {pages}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Modal
        open={!!rejecting}
        title="Reject leave request"
        onClose={() => setRejecting(null)}
      >
        <form onSubmit={onReject} style={{ display: 'grid', gap: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            {rejecting?.leaveNumber} · {rejecting?.student?.fullName}
          </p>
          <label className="field">
            <span>Reason</span>
            <textarea
              className="input"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              required
              minLength={2}
              placeholder="Why is this leave rejected?"
            />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>
              Close
            </Button>
            <Button type="submit" loading={busy}>
              Reject
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!cancelling}
        title="Cancel leave?"
        message={
          cancelling
            ? `Cancel leave ${cancelling.leaveNumber} for ${cancelling.student?.fullName ?? 'student'}?`
            : ''
        }
        loading={busy}
        onConfirm={() => void onCancel()}
        onClose={() => setCancelling(null)}
      />
    </AppShell>
  );
}
