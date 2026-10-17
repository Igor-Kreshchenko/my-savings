import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema.js';
import { RatesRepository } from './rates.repository.js';
import { RatesService } from './rates.service.js';

const databases: Database.Database[] = [];

function createRepository(): RatesRepository {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE rates (
      date TEXT NOT NULL,
      currency TEXT NOT NULL,
      rate_buy REAL NOT NULL,
      rate_sell REAL,
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (date, currency, source)
    )
  `);
  databases.push(sqlite);
  return new RatesRepository(drizzle(sqlite, { schema }));
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

describe('RatesService', () => {
  it('catches up missing weekdays after the latest stored rate', async () => {
    const repository = createRepository();
    repository.upsert({
      date: '2026-10-14',
      currency: 'USD',
      rateBuy: 41.25,
      rateSell: null,
      source: 'nbu',
      fetchedAt: '2026-10-14T13:00:00.000Z',
    });
    const getRate = vi.fn(async (date: string) =>
      date === '2026-10-16'
        ? null
        : {
            date,
            currency: 'USD',
            rateBuy: 41.5,
            rateSell: null,
            source: 'nbu',
            fetchedAt: '2026-10-20T13:00:00.000Z',
          },
    );
    const service = new RatesService(
      repository,
      { getRate },
      () => '2026-10-20',
    );

    await expect(service.catchUp()).resolves.toEqual({
      attempted: 4,
      stored: 3,
      unavailable: 1,
    });
    expect(getRate.mock.calls.map(([date]) => date)).toEqual([
      '2026-10-15',
      '2026-10-16',
      '2026-10-19',
      '2026-10-20',
    ]);
    expect(
      repository.getMissingBusinessDates('2026-10-14', '2026-10-20'),
    ).toEqual(['2026-10-16']);
  });

  it('starts with today when the rates table is empty', async () => {
    const getRate = vi.fn(async (date: string) => ({
      date,
      currency: 'USD',
      rateBuy: 41.5,
      rateSell: null,
      source: 'nbu',
      fetchedAt: '2026-10-20T13:00:00.000Z',
    }));
    const service = new RatesService(
      createRepository(),
      { getRate },
      () => '2026-10-20',
    );

    await service.catchUp();

    expect(getRate.mock.calls.map(([date]) => date)).toEqual(['2026-10-20']);
  });

  it('does not request weekend dates during backfill', async () => {
    const getRate = vi.fn(async (date: string) => ({
      date,
      currency: 'USD',
      rateBuy: 41.5,
      rateSell: null,
      source: 'nbu',
      fetchedAt: '2026-10-20T13:00:00.000Z',
    }));
    const service = new RatesService(
      createRepository(),
      { getRate },
      () => '2026-10-20',
    );

    await service.backfill('2026-10-17');

    expect(getRate.mock.calls.map(([date]) => date)).toEqual([
      '2026-10-19',
      '2026-10-20',
    ]);
  });

  it('updates only today with the Monobank source', async () => {
    const repository = createRepository();
    const getRate = vi.fn(async (date: string) => ({
      date,
      currency: 'USD',
      rateBuy: 41.5,
      rateSell: 41.7,
      source: 'mono' as const,
      fetchedAt: '2026-10-20T13:00:00.000Z',
    }));
    const service = new RatesService(
      repository,
      { getRate },
      () => '2026-10-20',
      () => new Date('2026-10-20T13:00:00.000Z'),
    );

    await expect(service.updateToday()).resolves.toEqual({
      attempted: 1,
      stored: 1,
      unavailable: 0,
    });
    expect(getRate).toHaveBeenCalledExactlyOnceWith('2026-10-20');
    expect(repository.list({})).toEqual([
      {
        date: '2026-10-20',
        currency: 'USD',
        rateBuy: 41.5,
        rateSell: 41.7,
        source: 'mono',
        fetchedAt: '2026-10-20T13:00:00.000Z',
      },
    ]);
  });

  it('does not treat a Monobank row as an NBU gap filler', async () => {
    const repository = createRepository();
    repository.upsert({
      date: '2026-10-20',
      currency: 'USD',
      rateBuy: 41.5,
      rateSell: 41.7,
      source: 'mono',
      fetchedAt: '2026-10-20T13:00:00.000Z',
    });
    const getRate = vi.fn(async (date: string) => ({
      date,
      currency: 'USD',
      rateBuy: 41,
      rateSell: null,
      source: 'nbu' as const,
      fetchedAt: '2026-10-20T14:00:00.000Z',
    }));
    const service = new RatesService(
      repository,
      { getRate },
      () => '2026-10-20',
    );

    await service.catchUp();

    expect(getRate).toHaveBeenCalledExactlyOnceWith('2026-10-20');
    expect(repository.list({})).toHaveLength(2);
  });
});
