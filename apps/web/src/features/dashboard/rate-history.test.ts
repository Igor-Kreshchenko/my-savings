import { describe, expect, it } from 'vitest';
import { getRateHistoryPage, sortRatesByDate } from './rate-history.js';
import type { Rate } from '@my-savings/shared';

const rates: Rate[] = [
  {
    date: '2026-10-17',
    currency: 'USD',
    rateBuy: 41.2,
    rateSell: null,
    source: 'nbu',
    fetchedAt: '2026-10-17T13:00:00.000Z',
  },
  {
    date: '2026-10-16',
    currency: 'USD',
    rateBuy: 41.1,
    rateSell: null,
    source: 'mono',
    fetchedAt: '2026-10-16T13:00:00.000Z',
  },
  {
    date: '2026-10-17',
    currency: 'USD',
    rateBuy: 41.3,
    rateSell: 41.5,
    source: 'mono',
    fetchedAt: '2026-10-17T14:00:00.000Z',
  },
];

describe('rate history helpers', () => {
  it('sorts dates both ways with stable source ordering on the same date', () => {
    expect(
      sortRatesByDate(rates, 'desc').map(({ date, source }) => [date, source]),
    ).toEqual([
      ['2026-10-17', 'mono'],
      ['2026-10-17', 'nbu'],
      ['2026-10-16', 'mono'],
    ]);
    expect(sortRatesByDate(rates, 'asc').map(({ date }) => date)).toEqual([
      '2026-10-16',
      '2026-10-17',
      '2026-10-17',
    ]);
    expect(rates[0]?.date).toBe('2026-10-17');
  });

  it('returns only the requested page of rate rows', () => {
    expect(getRateHistoryPage(rates, 1, 2)).toEqual([rates[2]]);
    expect(getRateHistoryPage(rates, 2, 2)).toEqual([]);
  });

  it('rejects invalid page arguments', () => {
    expect(() => getRateHistoryPage(rates, -1, 10)).toThrow(RangeError);
    expect(() => getRateHistoryPage(rates, 0, 0)).toThrow(RangeError);
  });
});
