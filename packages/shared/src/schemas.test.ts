import { describe, expect, it } from 'vitest';
import {
  analyticsQuerySchema,
  analyticsResponseSchema,
  createBalanceEventSchema,
  rateSchema,
  rateRefreshResponseSchema,
  ratesQuerySchema,
} from './schemas.js';

describe('shared schemas', () => {
  it('validates rate data', () => {
    expect(
      rateSchema.parse({
        date: '2026-10-16',
        currency: 'USD',
        rateBuy: 41.2,
        rateSell: null,
        source: 'nbu',
        fetchedAt: '2026-10-16T13:00:00.000Z',
      }).currency,
    ).toBe('USD');
    expect(
      rateSchema.safeParse({
        date: '2026-02-29',
        currency: 'USD',
        rateBuy: 41.2,
        rateSell: null,
        source: 'nbu',
        fetchedAt: '2026-10-16T13:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('validates a refreshed Monobank rate response', () => {
    expect(
      rateRefreshResponseSchema.parse({
        date: '2026-10-16',
        rateBuy: 41.2,
        rateSell: null,
        fetchedAt: '2026-10-16T13:00:00.000Z',
        stale: true,
      }),
    ).toEqual({
      date: '2026-10-16',
      rateBuy: 41.2,
      rateSell: null,
      fetchedAt: '2026-10-16T13:00:00.000Z',
      stale: true,
    });
  });

  it('validates and parses request query parameters', () => {
    expect(
      analyticsQuerySchema.parse({
        positionId: '2',
        from: '2026-10-01',
        to: '2026-10-16',
      }),
    ).toEqual({
      positionId: 2,
      from: '2026-10-01',
      to: '2026-10-16',
    });
    expect(
      ratesQuerySchema.safeParse({ from: '2026-10-17', to: '2026-10-16' })
        .success,
    ).toBe(false);
  });

  it('rejects unsafe integer amounts for balance events', () => {
    expect(
      createBalanceEventSchema.safeParse({
        date: '2026-10-16',
        deltaCents: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
  });

  it('validates the analytics response contract', () => {
    expect(
      analyticsResponseSchema.safeParse({
        series: [
          {
            date: '2026-10-16',
            rate: 41.2,
            usd: 100,
            uah: 4120,
            pnlUah: 120,
            estimated: false,
          },
        ],
        daily: { uahChange: 12, rateChange: 0.002 },
        period: { uahChange: 12 },
        pnl: {
          netUah: 120,
          netPercent: 0.03,
          fxUah: 120,
          cashFlowUah: 0,
        },
        stats: {
          minRate: 40.9,
          maxRate: 41.2,
          maxDrawdown: 0.01,
          movingAverage7: 41.1,
          movingAverage30: 40.8,
        },
      }).success,
    ).toBe(true);
  });
});
