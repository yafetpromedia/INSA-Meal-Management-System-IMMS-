import { APP_TIMEZONE, formatEthiopiaTime } from '@/lib/timezone';

export type IncidentStatus =
  | 'OPEN'
  | 'UNDER_INVESTIGATION'
  | 'AWAITING_DECISION'
  | 'ACTION_ASSIGNED'
  | 'CLOSED'
  | 'APPEALED';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type DisciplinaryIncident = {
  id: string;
  incidentNumber: string;
  status: IncidentStatus | string;
  severity: IncidentSeverity | string;
  occurredAt: string;
  location?: string | null;
  description: string;
  witnesses?: string | null;
  evidenceUrl?: string | null;
  investigationNotes?: string | null;
  decisionNotes?: string | null;
  acknowledgmentNotes?: string | null;
  acknowledgedAt?: string | null;
  closedAt?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  student?: {
    id: string;
    studentId: string;
    fullName: string;
    barcode?: string;
  } | null;
  incidentType?: {
    id: string;
    name: string;
    category: string;
  } | null;
  campus?: { id: string; name: string; shortName?: string | null } | null;
  program?: { id: string; name: string } | null;
  reportedBy?: { id: string; fullName: string } | null;
  assignedTo?: { id: string; fullName: string } | null;
  decidedBy?: { id: string; fullName: string } | null;
  actions?: Array<{
    id: string;
    description?: string | null;
    status: string;
    startDate?: string | null;
    endDate?: string | null;
    completedAt?: string | null;
    actionType?: { id: string; name: string; affectsMeals?: boolean } | null;
    assignedBy?: { id: string; fullName: string } | null;
  }>;
};

export type IncidentType = {
  id: string;
  category: string;
  name: string;
  description?: string | null;
  active: boolean;
  sortOrder: number;
};

export type DisciplinaryActionType = {
  id: string;
  name: string;
  description?: string | null;
  affectsMeals: boolean;
  active: boolean;
  sortOrder: number;
};

export type DisciplinarySummary = {
  openCases: number;
  studentsUnderAction: number;
  incidentsToday: number;
  highSeverityOpen: number;
  repeatOffenders: number;
  repeatOffenderSamples: Array<{
    id: string;
    studentId: string;
    fullName: string;
    incidentCount: number;
    highSeverityCount: number;
    campus?: { shortName?: string | null; name?: string } | null;
  }>;
  mostCommonTypes: Array<{
    incidentTypeId: string;
    name: string;
    category: string;
    count: number;
  }>;
  thresholds: {
    warningCount: number;
    warningDays: number;
    highSeverityCount: number;
  };
};

export function incidentStatusLabel(status: string) {
  switch (status) {
    case 'OPEN':
      return 'Open';
    case 'UNDER_INVESTIGATION':
      return 'Under Investigation';
    case 'AWAITING_DECISION':
      return 'Awaiting Decision';
    case 'ACTION_ASSIGNED':
      return 'Action Assigned';
    case 'CLOSED':
      return 'Closed';
    case 'APPEALED':
      return 'Appealed';
    default:
      return status;
  }
}

export function incidentStatusTone(
  status: string,
): 'success' | 'warning' | 'error' | 'info' {
  switch (status) {
    case 'CLOSED':
      return 'success';
    case 'OPEN':
    case 'UNDER_INVESTIGATION':
      return 'info';
    case 'AWAITING_DECISION':
    case 'ACTION_ASSIGNED':
      return 'warning';
    case 'APPEALED':
      return 'error';
    default:
      return 'info';
  }
}

export function severityTone(
  severity: string,
): 'success' | 'warning' | 'error' | 'info' {
  switch (severity) {
    case 'LOW':
      return 'info';
    case 'MEDIUM':
      return 'warning';
    case 'HIGH':
    case 'CRITICAL':
      return 'error';
    default:
      return 'info';
  }
}

export function formatIncidentWhen(value: string) {
  const d = new Date(value);
  const day = d.toLocaleDateString('en-GB', {
    timeZone: APP_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${day} · ${formatEthiopiaTime(d)}`;
}
