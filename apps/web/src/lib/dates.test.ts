import { describe, expect, it } from 'vitest';
import { addCalendarDays, getTodayInKyiv } from './dates.js';

describe('dashboard date helpers', () => {
  it('gets today in Kyiv even when UTC is on the previous calendar day', () => {
    expect(getTodayInKyiv(new Date('2026-10-16T22:30:00.000Z'))).toBe(
      '2026-10-17',
    );
  });

  it('shifts calendar dates across month and year boundaries', () => {
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addCalendarDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('rejects invalid dates and non-integer offsets', () => {
    expect(() => addCalendarDays('2026-02-30', -1)).toThrow();
    expect(() => addCalendarDays('2026-01-01', 1.5)).toThrow(
      'days must be an integer',
    );
  });
});
