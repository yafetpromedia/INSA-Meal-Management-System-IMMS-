import { APP_TIMEZONE, formatEthiopiaTime } from '@/lib/timezone';

export type LeaveStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHECKED_OUT'
  | 'RETURNED'
  | 'OVERDUE'
  | 'CANCELLED'
  | 'EXPIRED';

export type LeaveStudent = {
  id: string;
  studentId: string;
  fullName: string;
  barcode?: string;
  status?: string;
  campusId?: string;
  programId?: string;
  organizationId?: string;
};

export type LeaveTypeRef = { id: string; name: string; active?: boolean };

export type LeaveRequest = {
  id: string;
  leaveNumber: string;
  status: LeaveStatus | string;
  reason: string;
  destination: string;
  expectedExitTime: string;
  expectedReturnTime: string;
  notes?: string | null;
  rejectionReason?: string | null;
  approvedAt?: string | null;
  actualExitTime?: string | null;
  actualReturnTime?: string | null;
  createdAt: string;
  student?: LeaveStudent | null;
  leaveType?: LeaveTypeRef | null;
  campus?: { id: string; name: string; shortName?: string | null } | null;
  program?: { id: string; name: string } | null;
  createdBy?: { id: string; fullName: string } | null;
  approvedBy?: { id: string; fullName: string } | null;
  gateLogs?: Array<{
    id: string;
    action: string;
    scannedAt: string;
    gateLocation?: string | null;
    remarks?: string | null;
    gateOfficer?: { id: string; fullName: string } | null;
  }>;
};

export type LeaveSummary = {
  outside: number;
  returnedToday: number;
  pending: number;
  approvedToday: number;
  rejectedToday: number;
  overdue: number;
  avgDurationMinutes: number | null;
  topLeaveType: { id: string; name: string; count: number } | null;
};

export function leaveStatusTone(
  status: string,
): 'success' | 'warning' | 'error' | 'info' {
  switch (status) {
    case 'APPROVED':
    case 'RETURNED':
      return 'success';
    case 'PENDING':
    case 'CHECKED_OUT':
      return 'info';
    case 'OVERDUE':
    case 'EXPIRED':
      return 'warning';
    case 'REJECTED':
    case 'CANCELLED':
      return 'error';
    default:
      return 'info';
  }
}

export function leaveStatusLabel(status: string) {
  return status.replace(/_/g, ' ');
}

export function formatLeaveDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: APP_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatLeaveDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${formatLeaveDate(iso)} · ${formatEthiopiaTime(d)}`;
}

export function formatDurationMinutes(mins: number | null | undefined) {
  if (mins == null || Number.isNaN(mins)) return '—';
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

export function durationBetween(from?: string | null, to?: string | null) {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / 60_000;
}

export function overdueMinutes(expectedReturn?: string | null, now = new Date()) {
  if (!expectedReturn) return null;
  const exp = new Date(expectedReturn).getTime();
  if (Number.isNaN(exp)) return null;
  return Math.max(0, (now.getTime() - exp) / 60_000);
}

/** Convert datetime-local value to ISO for the API. */
export function localInputToIso(value: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

/** Convert ISO to datetime-local input value. */
export function isoToLocalInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
