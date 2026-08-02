import { APP_TIMEZONE, formatEthiopiaTime } from '@/lib/timezone';

export type ActivityReportStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'ARCHIVED';

export type ActivityCategory = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  sortOrder: number;
};

export type ActivityMedia = {
  id: string;
  fileName: string;
  originalName: string;
  fileType: string;
  mimeType: string;
  fileSize: number;
  caption?: string | null;
  sortOrder: number;
  uploadedAt: string;
  uploadedBy?: { id: string; fullName: string } | null;
  report?: {
    id: string;
    reportNumber: string;
    title: string;
    reportDate: string;
    campus?: { id: string; shortName?: string | null; name?: string } | null;
    category?: { id: string; name: string } | null;
    submittedBy?: { id: string; fullName: string } | null;
  };
};

export type ActivityReport = {
  id: string;
  reportNumber: string;
  title: string;
  categoryId: string;
  campusId: string;
  programId?: string | null;
  academicYearId: string;
  reportDate: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  objectives?: string | null;
  description: string;
  activitiesPerformed?: string | null;
  outcomes?: string | null;
  challenges?: string | null;
  recommendations?: string | null;
  participantCount: number;
  status: ActivityReportStatus | string;
  reviewNotes?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string; active?: boolean } | null;
  campus?: { id: string; name: string; shortName?: string | null } | null;
  program?: { id: string; name: string } | null;
  academicYear?: { id: string; name: string } | null;
  submittedBy?: { id: string; fullName: string } | null;
  reviewedBy?: { id: string; fullName: string } | null;
  media?: ActivityMedia[];
  participants?: Array<{
    id: string;
    student?: { id: string; studentId: string; fullName: string } | null;
  }>;
  _count?: { media: number; participants: number };
};

export type ActivitySummary = {
  activitiesToday: number;
  submittedToday: number;
  pendingApprovals: number;
  approvedReports: number;
  photosToday: number;
  weeklyActivityCount: number;
  activeCampusesToday: number;
};

export type ActivityTimelineDay = {
  date: string;
  photoCount: number;
  reports: Array<{
    id: string;
    title: string;
    reportNumber: string;
    status: string;
    reportDate: string;
    category?: { name: string } | null;
    campus?: { shortName?: string | null; name?: string } | null;
    _count?: { media: number };
  }>;
};

export function activityStatusLabel(status: string) {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'SUBMITTED':
      return 'Submitted';
    case 'UNDER_REVIEW':
      return 'Under Review';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'PUBLISHED':
      return 'Published';
    case 'ARCHIVED':
      return 'Archived';
    default:
      return status;
  }
}

export function activityStatusTone(
  status: string,
): 'success' | 'warning' | 'error' | 'info' {
  switch (status) {
    case 'DRAFT':
      return 'info';
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return 'warning';
    case 'APPROVED':
    case 'PUBLISHED':
      return 'success';
    case 'REJECTED':
      return 'error';
    case 'ARCHIVED':
      return 'info';
    default:
      return 'info';
  }
}

export function formatActivityDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: APP_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value.includes('T') ? value : `${value}T12:00:00Z`));
  } catch {
    return value.slice(0, 10);
  }
}

export function formatMediaWhen(value?: string | null) {
  if (!value) return '—';
  return formatEthiopiaTime(new Date(value));
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
