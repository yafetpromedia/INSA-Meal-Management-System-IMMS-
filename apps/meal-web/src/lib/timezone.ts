/** Canonical business timezone for IMMS (Ethiopia). */
export const APP_TIMEZONE = 'Africa/Addis_Ababa';
export const APP_TIMEZONE_LABEL = 'EAT';

/**
 * Ethiopian local clock (የአገር ሰዓት): 12-hour cycles from ~06:00 / 18:00 Western.
 * Western 06:00 → 12:00 morning · Western 18:00 → 12:00 evening.
 * (Offset of 6 hours from the common US/Western wall clock.)
 */
export type EthiopianPeriod = 'morning' | 'daytime' | 'evening' | 'night';

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

function zonedParts(date: Date, timeZone = APP_TIMEZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'long',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '0';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24, // en-US hour12:false can yield 24
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: get('weekday'),
  };
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function parseHhMm(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Minutes since midnight in Ethiopia (Western EAT wall clock). */
export function ethiopiaMinutesNow(date = new Date()): number {
  const p = zonedParts(date);
  return p.hour * 60 + p.minute;
}

/**
 * Calendar date in Ethiopia as a UTC midnight Date
 * (stable for Prisma @db.Date / day comparisons).
 */
export function ethiopiaCalendarDate(date = new Date()): Date {
  const p = zonedParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

export function ethiopiaWeekday(date = new Date()): string {
  return zonedParts(date).weekday;
}

/**
 * Convert Western EAT HH:MM to Ethiopian 12-hour clock parts.
 * Dawn (06:00) and dusk (18:00) are 12 o'clock.
 */
export function westernToEthiopianClock(hhmm: string): {
  hour: number;
  minute: number;
  period: EthiopianPeriod;
  label: string;
} | null {
  const parsed = parseHhMm(hhmm);
  if (!parsed) return null;
  const westernMins = parsed.hour * 60 + parsed.minute;
  // Shift so Western 06:00 → 0 minutes into the Ethiopian day cycle
  const shifted = (westernMins - 6 * 60 + 24 * 60) % (24 * 60);
  const cycleHour = Math.floor(shifted / 60); // 0–23
  const minute = shifted % 60;
  const hour12 = cycleHour % 12 === 0 ? 12 : cycleHour % 12;
  const period: EthiopianPeriod =
    cycleHour < 6 ? 'morning' : cycleHour < 12 ? 'daytime' : cycleHour < 18 ? 'evening' : 'night';

  return {
    hour: hour12,
    minute,
    period,
    label: `${hour12}:${pad2(minute)} ${period}`,
  };
}

/** Format HH:MM (Western EAT storage) as Ethiopian 12-hour local time. */
export function formatEthiopianClock(hhmm: string): string {
  return westernToEthiopianClock(hhmm)?.label ?? hhmm;
}

/**
 * Live clock in Ethiopian 12-hour local time (optional seconds).
 */
export function formatEthiopiaTime(
  date = new Date(),
  opts: { withSeconds?: boolean } = {},
): string {
  const p = zonedParts(date);
  const clock = westernToEthiopianClock(`${pad2(p.hour)}:${pad2(p.minute)}`);
  if (!clock) return '';
  if (opts.withSeconds) {
    return `${clock.hour}:${pad2(clock.minute)}:${pad2(p.second)} ${clock.period}`;
  }
  return clock.label;
}

/** Meal session window in Ethiopian 12-hour local time. */
export function formatSessionWindow(startTime: string, endTime: string): string {
  return `${formatEthiopianClock(startTime)} – ${formatEthiopianClock(endTime)}`;
}

/** Short Western EAT hint for forms that still edit in 24h. */
export function formatWesternEatHint(startTime: string, endTime: string): string {
  const s = startTime.slice(0, 5);
  const e = endTime.slice(0, 5);
  return `${s}–${e} ${APP_TIMEZONE_LABEL} (Western)`;
}
