import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { balanceEvents, positions, rates } from './db/schema.js';
import { createServer } from './server.js';

const apiToken = 'test-token';
const authHeaders = { authorization: `Bearer ${apiToken}` };
const today = '2026-10-16';
const fetchedAt = '2026-10-16T13:00:00.000Z';
let app: ReturnType<typeof createServer>;
let getRate: ReturnType<typeof vi.fn>;
let monobankGetRate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getRate = vi.fn(async (date: string) => ({
    date,
    currency: 'USD',
    rateBuy: 41.5,
    rateSell: null,
    source: 'nbu',
    fetchedAt,
  }));
  monobankGetRate = vi.fn();
  app = createServer(
    {
      API_TOKEN: apiToken,
      DB_PATH: ':memory:',
      PORT: 3000,
      TZ: 'Europe/Kyiv',
    },
    {
      logger: false,
      enableRatesJobs: false,
      rateProvider: { getRate },
      monobankRateProvider: { getRate: monobankGetRate },
      getToday: () => today,
      now: () => new Date('2026-10-16T13:04:00.000Z'),
    },
  );
});

afterEach(async () => {
  await app.close();
});

describe('API routes', () => {
  it('serves GET /health without authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('returns a fresh stored Monobank row without calling the provider', async () => {
    app.db
      .insert(rates)
      .values({
        date: today,
        currency: 'USD',
        rateBuy: 41.5,
        rateSell: 41.7,
        source: 'mono',
        fetchedAt: '2026-10-16T13:00:00.000Z',
      })
      .run();

    const response = await app.inject({
      method: 'POST',
      url: '/rates/refresh',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      date: today,
      rateBuy: 41.5,
      rateSell: 41.7,
      fetchedAt: '2026-10-16T13:00:00.000Z',
      stale: false,
    });
    expect(monobankGetRate).not.toHaveBeenCalled();
  });

  it('refreshes and stores an old Monobank row', async () => {
    app.db
      .insert(rates)
      .values({
        date: today,
        currency: 'USD',
        rateBuy: 40,
        rateSell: 40.5,
        source: 'mono',
        fetchedAt: '2026-10-16T12:00:00.000Z',
      })
      .run();
    monobankGetRate.mockResolvedValue({
      date: today,
      currency: 'USD',
      rateBuy: 41.8,
      rateSell: 42,
      source: 'mono',
      fetchedAt: fetchedAt,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/rates/refresh',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      date: today,
      rateBuy: 41.8,
      rateSell: 42,
      fetchedAt: '2026-10-16T13:04:00.000Z',
      stale: false,
    });
    expect(monobankGetRate).toHaveBeenCalledExactlyOnceWith(today);
    expect(app.db.select().from(rates).all()).toHaveLength(1);
  });

  it('shares one provider request across ten parallel refresh requests', async () => {
    app.db
      .insert(rates)
      .values({
        date: today,
        currency: 'USD',
        rateBuy: 40,
        rateSell: 40.5,
        source: 'mono',
        fetchedAt: '2026-10-16T12:00:00.000Z',
      })
      .run();
    monobankGetRate.mockImplementation(
      async () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                date: today,
                currency: 'USD',
                rateBuy: 41.8,
                rateSell: 42,
                source: 'mono',
                fetchedAt,
              }),
            10,
          );
        }),
    );

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.inject({
          method: 'POST',
          url: '/rates/refresh',
          headers: authHeaders,
        }),
      ),
    );

    expect(responses.every(({ statusCode }) => statusCode === 200)).toBe(true);
    expect(responses.map(({ json }) => json().stale)).toEqual(
      Array.from({ length: 10 }, () => false),
    );
    expect(monobankGetRate).toHaveBeenCalledExactlyOnceWith(today);
  });

  it('returns a stale cached row when the provider fails', async () => {
    app.db
      .insert(rates)
      .values({
        date: today,
        currency: 'USD',
        rateBuy: 40,
        rateSell: 40.5,
        source: 'mono',
        fetchedAt: '2026-10-16T12:00:00.000Z',
      })
      .run();
    monobankGetRate.mockRejectedValue(new Error('Network unavailable'));

    const response = await app.inject({
      method: 'POST',
      url: '/rates/refresh',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      date: today,
      rateBuy: 40,
      rateSell: 40.5,
      fetchedAt: '2026-10-16T12:00:00.000Z',
      stale: true,
    });
  });

  it('requires authentication to refresh rates', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/rates/refresh',
    });

    expect(response.statusCode).toBe(401);
    expect(monobankGetRate).not.toHaveBeenCalled();
  });

  it('clears rates, positions, and balance events through authenticated DELETE /data', async () => {
    app.db
      .insert(positions)
      .values({ currency: 'USD', baseDate: today, baseRate: 41.5, note: null })
      .run();
    app.db
      .insert(balanceEvents)
      .values({ positionId: 1, date: today, deltaCents: 100_000, note: null })
      .run();
    app.db
      .insert(rates)
      .values({
        date: today,
        currency: 'USD',
        rateBuy: 41.5,
        rateSell: null,
        source: 'nbu',
        fetchedAt,
      })
      .run();

    const unauthorized = await app.inject({ method: 'DELETE', url: '/data' });
    expect(unauthorized.statusCode).toBe(401);
    expect(app.db.select().from(positions).all()).toHaveLength(1);

    const response = await app.inject({
      method: 'DELETE',
      url: '/data',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'cleared' });
    expect(app.db.select().from(balanceEvents).all()).toEqual([]);
    expect(app.db.select().from(positions).all()).toEqual([]);
    expect(app.db.select().from(rates).all()).toEqual([]);
  });

  it('serves GET /positions and requires a Bearer token', async () => {
    const unauthorized = await app.inject({
      method: 'GET',
      url: '/positions',
    });
    expect(unauthorized.statusCode).toBe(401);

    app.db
      .insert(positions)
      .values({
        currency: 'USD',
        baseDate: today,
        baseRate: 41.5,
        note: 'Savings',
      })
      .run();
    const response = await app.inject({
      method: 'GET',
      url: '/positions',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: 1,
        currency: 'USD',
        baseDate: today,
        baseRate: 41.5,
        note: 'Savings',
      },
    ]);
  });

  it('serves POST /positions and backfills rates from its base date', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/positions',
      headers: authHeaders,
      payload: {
        currency: 'USD',
        baseDate: today,
        baseRate: 41.5,
        note: 'Initial position',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: 1,
      currency: 'USD',
      baseDate: today,
      baseRate: 41.5,
      note: 'Initial position',
    });
    expect(getRate).toHaveBeenCalledExactlyOnceWith(today);
    expect(monobankGetRate).not.toHaveBeenCalled();
    expect(app.db.select().from(rates).all()).toEqual([
      {
        date: today,
        currency: 'USD',
        rateBuy: 41.5,
        rateSell: null,
        source: 'nbu',
        fetchedAt,
      },
    ]);
  });

  it('serves POST /positions/:id/events and rejects overdrafts', async () => {
    app.db
      .insert(positions)
      .values({ currency: 'USD', baseDate: today, baseRate: 41.5, note: null })
      .run();

    const depositResponse = await app.inject({
      method: 'POST',
      url: '/positions/1/events',
      headers: authHeaders,
      payload: { date: today, deltaCents: 100_000 },
    });
    expect(depositResponse.statusCode).toBe(201);
    expect(depositResponse.json()).toEqual({
      id: 1,
      positionId: 1,
      date: today,
      deltaCents: 100_000,
      note: null,
    });

    const overdraftResponse = await app.inject({
      method: 'POST',
      url: '/positions/1/events',
      headers: authHeaders,
      payload: { date: today, deltaCents: -100_001 },
    });
    expect(overdraftResponse.statusCode).toBe(400);
    expect(overdraftResponse.json().error.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('serves GET /rates with date filtering', async () => {
    app.db
      .insert(rates)
      .values([
        {
          date: '2026-10-15',
          currency: 'USD',
          rateBuy: 41.25,
          rateSell: null,
          source: 'nbu',
          fetchedAt,
        },
        {
          date: today,
          currency: 'USD',
          rateBuy: 41.5,
          rateSell: null,
          source: 'nbu',
          fetchedAt,
        },
      ])
      .run();

    const response = await app.inject({
      method: 'GET',
      url: '/rates?from=2026-10-16&to=2026-10-16',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        date: today,
        currency: 'USD',
        rateBuy: 41.5,
        rateSell: null,
        source: 'nbu',
        fetchedAt,
      },
    ]);
  });

  it('serves GET /analytics with the shared response shape', async () => {
    app.db
      .insert(positions)
      .values({ currency: 'USD', baseDate: today, baseRate: 40, note: null })
      .run();
    app.db
      .insert(balanceEvents)
      .values({
        positionId: 1,
        date: today,
        deltaCents: 100_000,
        note: null,
      })
      .run();
    app.db
      .insert(rates)
      .values({
        date: today,
        currency: 'USD',
        rateBuy: 41,
        rateSell: null,
        source: 'nbu',
        fetchedAt,
      })
      .run();

    const response = await app.inject({
      method: 'GET',
      url: `/analytics?positionId=1&from=${today}&to=${today}`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      series: [
        {
          date: today,
          rate: 41,
          usd: 1_000,
          uah: 41_000,
          estimated: true,
          pnlUah: 0,
        },
      ],
      daily: { uahChange: null, rateChange: null },
      period: { uahChange: 0 },
      pnl: {
        netUah: null,
        netPercent: null,
        fxUah: 0,
        cashFlowUah: 41_000,
      },
      stats: {
        minRate: 41,
        maxRate: 41,
        maxDrawdown: 0,
        movingAverage7: null,
        movingAverage30: null,
      },
    });
  });

  it('prefers the stored Monobank buy rate over the NBU fallback', async () => {
    app.db
      .insert(positions)
      .values({ currency: 'USD', baseDate: today, baseRate: 40, note: null })
      .run();
    app.db
      .insert(balanceEvents)
      .values({
        positionId: 1,
        date: today,
        deltaCents: 100_000,
        note: null,
      })
      .run();
    app.db
      .insert(rates)
      .values([
        {
          date: today,
          currency: 'USD',
          rateBuy: 41,
          rateSell: null,
          source: 'nbu',
          fetchedAt,
        },
        {
          date: today,
          currency: 'USD',
          rateBuy: 42,
          rateSell: 42.5,
          source: 'mono',
          fetchedAt,
        },
      ])
      .run();

    const response = await app.inject({
      method: 'GET',
      url: `/analytics?positionId=1&from=${today}&to=${today}`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().series).toEqual([
      {
        date: today,
        rate: 42,
        usd: 1_000,
        uah: 42_000,
        estimated: false,
        pnlUah: 0,
      },
    ]);
    expect(monobankGetRate).not.toHaveBeenCalled();
  });
});
