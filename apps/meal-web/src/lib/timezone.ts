/** Canonical business timezone for IMMS (Ethiopia). */
export const APP_TIMEZONE = 'Africa/Addis_Ababa';
export const APP_TIMEZONE_LABEL = 'EAT';

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

/** Minutes since midnight in Ethiopia. */
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

export function formatEthiopiaTime(
  date = new Date(),
  opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  },
): string {
  return date.toLocaleTimeString('en-GB', { timeZone: APP_TIMEZONE, ...opts });
}

export function formatSessionWindow(startTime: string, endTime: string): string {
  return `${startTime} – ${endTime} ${APP_TIMEZONE_LABEL}`;
}
