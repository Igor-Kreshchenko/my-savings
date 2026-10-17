import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import * as schema from '../../db/schema.js';
import { RatesRepository } from './rates.repository.js';

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

describe('RatesRepository', () => {
  it('upserts a rate using its date, currency, and source key', () => {
    const repository = createRepository();
    const firstRate = {
      date: '2026-10-16',
      currency: 'USD',
      rateBuy: 41.25,
      rateSell: null,
      source: 'nbu',
      fetchedAt: '2026-10-16T13:00:00.000Z',
    };

    repository.upsert(firstRate);
    repository.upsert({ ...firstRate, rateBuy: 41.5 });

    expect(repository.getLatestDate()).toBe('2026-10-16');
    expect(
      repository.getMissingBusinessDates('2026-10-16', '2026-10-16'),
    ).toEqual([]);
  });

  it('detects missing weekdays and ignores existing rates and weekends', () => {
    const repository = createRepository();
    const rate = {
      currency: 'USD',
      rateBuy: 41.25,
      rateSell: null,
      source: 'nbu',
      fetchedAt: '2026-10-16T13:00:00.000Z',
    };
    repository.upsert({ ...rate, date: '2026-10-14' });
    repository.upsert({ ...rate, date: '2026-10-19' });

    expect(
      repository.getMissingBusinessDates('2026-10-14', '2026-10-20'),
    ).toEqual(['2026-10-15', '2026-10-16', '2026-10-20']);
  });

  it('stores distinct sources for the same date and currency', () => {
    const repository = createRepository();
    const rate = {
      date: '2026-10-16',
      currency: 'USD',
      rateBuy: 41.25,
      rateSell: null,
      fetchedAt: '2026-10-16T13:00:00.000Z',
    };

    repository.upsert({ ...rate, source: 'nbu' });
    repository.upsert({
      ...rate,
      rateBuy: 41.5,
      rateSell: 41.7,
      source: 'mono',
    });

    expect(repository.list({})).toEqual([
      {
        ...rate,
        rateBuy: 41.5,
        rateSell: 41.7,
        source: 'mono',
      },
      { ...rate, source: 'nbu' },
    ]);
  });
});
