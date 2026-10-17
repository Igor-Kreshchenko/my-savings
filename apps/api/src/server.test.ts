import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { balanceEvents, positions, rates } from './db/schema.js';
import { createServer } from './server.js';

const apiToken = 'test-token';
const authHeaders = { authorization: `Bearer ${apiToken}` };
const today = '2026-10-16';
const fetchedAt = '2026-10-16T13:00:00.000Z';
let app: ReturnType<typeof createServer>;
let getRate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getRate = vi.fn(async (date: string) => ({
    date,
    currency: 'USD',
    rate: 41.5,
    source: 'NBU',
    fetchedAt,
  }));
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
      getToday: () => today,
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
        rate: 41.5,
        source: 'NBU',
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
    expect(app.db.select().from(rates).all()).toEqual([
      {
        date: today,
        currency: 'USD',
        rate: 41.5,
        source: 'NBU',
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
          rate: 41.25,
          source: 'NBU',
          fetchedAt,
        },
        {
          date: today,
          currency: 'USD',
          rate: 41.5,
          source: 'NBU',
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
        rate: 41.5,
        source: 'NBU',
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
        rate: 41,
        source: 'NBU',
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
      series: [{ date: today, rate: 41, usd: 1_000, uah: 41_000 }],
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
});
