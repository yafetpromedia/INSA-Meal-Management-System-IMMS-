import type { LeaveRequest } from '@/lib/leave';

export type GatePassLayout = 1 | 4 | 8;

export type GatePassTemplateSettings = {
  headerText: string;
  subHeaderText: string;
  footerText: string;
  cardsPerPage: GatePassLayout;
  showLogo: boolean;
  showBarcode: boolean;
  showQr: boolean;
  showDestination: boolean;
  showNotes: boolean;
  showSignature: boolean;
  showStamp: boolean;
  showCampus: boolean;
  showProgram: boolean;
};

export const GATE_PASS_SETTINGS_KEY = 'settings.gatePass';

export const DEFAULT_GATE_PASS_SETTINGS: GatePassTemplateSettings = {
  headerText: 'INSA Summer Camp',
  subHeaderText: 'Gate Pass',
  footerText: 'Present this pass with your student ID at the gate.',
  cardsPerPage: 8,
  showLogo: true,
  showBarcode: true,
  showQr: true,
  showDestination: true,
  showNotes: false,
  showSignature: true,
  showStamp: true,
  showCampus: true,
  showProgram: true,
};

export type GatePassCardData = {
  leaveNumber: string;
  studentName: string;
  studentId: string;
  barcode: string;
  campus: string;
  program: string;
  leaveType: string;
  destination: string;
  reason?: string;
  notes?: string;
  exitTime: string;
  returnTime: string;
  dateLabel: string;
  approvedBy: string;
  status?: string;
  /** Blank template — all fields empty for handwriting */
  blank?: boolean;
  cardIndex?: number;
};

export function leaveToCardData(leave: LeaveRequest): GatePassCardData {
  return {
    leaveNumber: leave.leaveNumber,
    studentName: leave.student?.fullName ?? '',
    studentId: leave.student?.studentId ?? '',
    barcode: leave.student?.barcode || leave.student?.studentId || '',
    campus: leave.campus?.shortName || leave.campus?.name || '',
    program: leave.program?.name || '',
    leaveType: leave.leaveType?.name || '',
    destination: leave.destination || '',
    reason: leave.reason || '',
    notes: leave.notes || '',
    exitTime: leave.expectedExitTime,
    returnTime: leave.expectedReturnTime,
    dateLabel: leave.expectedExitTime,
    approvedBy: leave.approvedBy?.fullName || '',
    status: leave.status,
    blank: false,
  };
}

export function blankCard(index: number): GatePassCardData {
  return {
    leaveNumber: '',
    studentName: '',
    studentId: '',
    barcode: '',
    campus: '',
    program: '',
    leaveType: '',
    destination: '',
    exitTime: '',
    returnTime: '',
    dateLabel: '',
    approvedBy: '',
    blank: true,
    cardIndex: index,
  };
}

export function chunkCards<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  if (pages.length === 0) pages.push([]);
  return pages;
}

export function padPageSlots<T>(
  pageItems: T[],
  perPage: number,
  filler: (i: number) => T,
): T[] {
  const out = [...pageItems];
  let i = 0;
  while (out.length < perPage) {
    out.push(filler(i++));
  }
  return out;
}

export function mergeGatePassSettings(
  raw: unknown,
): GatePassTemplateSettings {
  const base = { ...DEFAULT_GATE_PASS_SETTINGS };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const layout = Number(o.cardsPerPage);
  return {
    headerText: typeof o.headerText === 'string' ? o.headerText : base.headerText,
    subHeaderText:
      typeof o.subHeaderText === 'string' ? o.subHeaderText : base.subHeaderText,
    footerText: typeof o.footerText === 'string' ? o.footerText : base.footerText,
    cardsPerPage: layout === 1 || layout === 4 || layout === 8 ? layout : base.cardsPerPage,
    showLogo: typeof o.showLogo === 'boolean' ? o.showLogo : base.showLogo,
    showBarcode: typeof o.showBarcode === 'boolean' ? o.showBarcode : base.showBarcode,
    showQr: typeof o.showQr === 'boolean' ? o.showQr : base.showQr,
    showDestination:
      typeof o.showDestination === 'boolean' ? o.showDestination : base.showDestination,
    showNotes: typeof o.showNotes === 'boolean' ? o.showNotes : base.showNotes,
    showSignature:
      typeof o.showSignature === 'boolean' ? o.showSignature : base.showSignature,
    showStamp: typeof o.showStamp === 'boolean' ? o.showStamp : base.showStamp,
    showCampus: typeof o.showCampus === 'boolean' ? o.showCampus : base.showCampus,
    showProgram: typeof o.showProgram === 'boolean' ? o.showProgram : base.showProgram,
  };
}

export function cacheGatePassSettings(settings: GatePassTemplateSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GATE_PASS_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function readCachedGatePassSettings(): GatePassTemplateSettings {
  if (typeof window === 'undefined') return DEFAULT_GATE_PASS_SETTINGS;
  try {
    const raw = localStorage.getItem(GATE_PASS_SETTINGS_KEY);
    if (!raw) return DEFAULT_GATE_PASS_SETTINGS;
    return mergeGatePassSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_GATE_PASS_SETTINGS;
  }
}
