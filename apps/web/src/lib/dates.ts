import { dateSchema } from '@my-savings/shared';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function getTodayInKyiv(now: Date = new Date()): string {
  const parts = new Map(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  const year = parts.get('year');
  const month = parts.get('month');
  const day = parts.get('day');

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('Could not determine the current date in Europe/Kyiv');
  }

  return `${year}-${month}-${day}`;
}

export function addCalendarDays(date: string, days: number): string {
  const validDate = dateSchema.parse(date);
  if (!Number.isInteger(days)) {
    throw new RangeError('days must be an integer');
  }

  const timestamp =
    Date.parse(`${validDate}T00:00:00.000Z`) + days * MILLISECONDS_PER_DAY;
  return new Date(timestamp).toISOString().slice(0, 10);
}
