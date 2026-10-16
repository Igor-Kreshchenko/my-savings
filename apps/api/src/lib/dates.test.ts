import { describe, expect, it } from 'vitest';
import { addCalendarDays, getTodayInTimezone, listWeekdays } from './dates.js';

describe('date helpers', () => {
  it('gets the current calendar date in the configured timezone', () => {
    const now = new Date('2026-10-15T21:30:00.000Z');

    expect(getTodayInTimezone('Europe/Kyiv', now)).toBe('2026-10-16');
  });

  it('adds calendar days across month and leap-year boundaries', () => {
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addCalendarDays('2024-02-29', 1)).toBe('2024-03-01');
  });

  it('lists weekdays without weekend dates', () => {
    expect(listWeekdays('2026-10-16', '2026-10-20')).toEqual([
      '2026-10-16',
      '2026-10-19',
      '2026-10-20',
    ]);
  });
});
