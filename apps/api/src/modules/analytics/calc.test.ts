import { describe, expect, it } from 'vitest';
import {
  amountAtDate,
  calculateBasePnl,
  calculateDayOverDay,
  calculateEventPnl,
  calculatePeriodChange,
  calculatePnl,
  calculatePnlSeries,
  calculateStats,
  calculateValue,
  forwardFillRates,
} from './calc.js';

describe('analytics calculations', () => {
  it('forward-fills the last known rate across weekends', () => {
    expect(
      forwardFillRates(
        [
          { date: '2026-10-19', rate: 41.2 },
          { date: '2026-10-16', rate: 41 },
        ],
        '2026-10-16',
        '2026-10-20',
      ),
    ).toEqual([
      { date: '2026-10-16', rate: 41, estimated: false },
      { date: '2026-10-17', rate: 41, estimated: true },
      { date: '2026-10-18', rate: 41, estimated: true },
      { date: '2026-10-19', rate: 41.2, estimated: false },
      { date: '2026-10-20', rate: 41.2, estimated: true },
    ]);
  });

  it('does not invent a rate before the first known rate', () => {
    expect(
      forwardFillRates(
        [{ date: '2026-10-19', rate: 41.2 }],
        '2026-10-17',
        '2026-10-20',
      ),
    ).toEqual([
      { date: '2026-10-19', rate: 41.2, estimated: false },
      { date: '2026-10-20', rate: 41.2, estimated: true },
    ]);
  });

  it('sums deposits and withdrawals through the requested date in cents', () => {
    const events = [
      { date: '2026-10-01', deltaCents: 1_000_000 },
      { date: '2026-10-05', deltaCents: 25_000 },
      { date: '2026-10-08', deltaCents: -10_000 },
    ];

    expect(amountAtDate(events, '2026-10-04')).toBe(1_000_000);
    expect(amountAtDate(events, '2026-10-05')).toBe(1_025_000);
    expect(amountAtDate(events, '2026-10-08')).toBe(1_015_000);
  });

  it('calculates value, day-over-day changes and period change', () => {
    const previous = { date: '2026-10-16', rate: 40, usd: 1_000, uah: 40_000 };
    const current = { date: '2026-10-19', rate: 42, usd: 1_000, uah: 42_000 };

    expect(calculateValue(100_000, 42)).toBe(42_000);
    const dayOverDay = calculateDayOverDay(current, previous);
    expect(dayOverDay.uahChange).toBe(2_000);
    expect(dayOverDay.rateChange).toBeCloseTo(0.05);
    expect(calculateDayOverDay(current, undefined)).toEqual({
      uahChange: null,
      rateChange: null,
    });
    expect(calculatePeriodChange(previous, current)).toBe(2_000);
  });

  it('calculates base PnL using the supplied base rate', () => {
    const pnl = calculateBasePnl(100_000, 40, 42);
    expect(pnl.netUah).toBe(2_000);
    expect(pnl.netPercent).toBeCloseTo(0.05);
  });

  it('separates FX PnL and cash flow for deposits and withdrawals', () => {
    const events = [
      { date: '2026-10-01', deltaCents: 100_000 },
      { date: '2026-10-02', deltaCents: 10_000 },
      { date: '2026-10-03', deltaCents: -5_000 },
    ];
    const rates = [
      { date: '2026-10-01', rate: 40 },
      { date: '2026-10-02', rate: 42 },
      { date: '2026-10-03', rate: 43 },
      { date: '2026-10-05', rate: 44 },
    ];

    expect(calculateEventPnl(events, rates, '2026-10-05')).toEqual({
      fxUah: 4_150,
      cashFlowUah: 42_050,
    });
    expect(calculatePnl(events, rates, '2026-10-05', 100_000, 40)).toEqual({
      netUah: null,
      netPercent: null,
      fxUah: 4_150,
      cashFlowUah: 42_050,
    });
  });

  it('returns base PnL when there are no balance events', () => {
    const pnl = calculatePnl(
      [],
      [{ date: '2026-10-05', rate: 42 }],
      '2026-10-05',
      100_000,
      40,
    );

    expect(pnl).toMatchObject({
      netUah: 2_000,
      fxUah: 2_000,
      cashFlowUah: 0,
    });
    expect(pnl.netPercent).toBeCloseTo(0.05);
  });

  it('builds a cash-flow-adjusted FX PnL series', () => {
    const events = [
      { date: '2026-10-01', deltaCents: 10_000 },
      { date: '2026-10-02', deltaCents: 1_000 },
      { date: '2026-10-03', deltaCents: -500 },
    ];
    const rates = [
      { date: '2026-10-01', rate: 40 },
      { date: '2026-10-02', rate: 42 },
      { date: '2026-10-03', rate: 43 },
      { date: '2026-10-05', rate: 44 },
    ];

    expect(
      calculatePnlSeries(
        events,
        rates,
        ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'],
        10_000,
        40,
      ),
    ).toEqual([0, 200, 310, 415]);
  });

  it('uses the latest prior rate for an event on a weekend', () => {
    expect(
      calculateEventPnl(
        [{ date: '2026-10-17', deltaCents: 10_000 }],
        [
          { date: '2026-10-16', rate: 40 },
          { date: '2026-10-19', rate: 42 },
        ],
        '2026-10-19',
      ),
    ).toEqual({ fxUah: 200, cashFlowUah: 4_000 });
  });

  it('calculates rate range, drawdown and 7/30-day rate averages', () => {
    const series = Array.from({ length: 30 }, (_, index) => ({
      rate: index + 1,
      uah: [100, 120, 90][index] ?? 100 + index,
    }));

    expect(calculateStats(series)).toEqual({
      minRate: 1,
      maxRate: 30,
      maxDrawdown: 0.25,
      movingAverage7: 27,
      movingAverage30: 15.5,
    });
    expect(calculateStats(series.slice(0, 6)).movingAverage7).toBeNull();
    expect(calculateStats([])).toEqual({
      minRate: null,
      maxRate: null,
      maxDrawdown: null,
      movingAverage7: null,
      movingAverage30: null,
    });
  });
});
