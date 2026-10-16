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
      rate REAL NOT NULL,
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (date, currency)
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
  it('upserts a rate using the date and currency key', () => {
    const repository = createRepository();
    const firstRate = {
      date: '2026-10-16',
      currency: 'USD',
      rate: 41.25,
      source: 'NBU',
      fetchedAt: '2026-10-16T13:00:00.000Z',
    };

    repository.upsert(firstRate);
    repository.upsert({ ...firstRate, rate: 41.5 });

    expect(repository.getLatestDate()).toBe('2026-10-16');
    expect(
      repository.getMissingBusinessDates('2026-10-16', '2026-10-16'),
    ).toEqual([]);
  });

  it('detects missing weekdays and ignores existing rates and weekends', () => {
    const repository = createRepository();
    const rate = {
      currency: 'USD',
      rate: 41.25,
      source: 'NBU',
      fetchedAt: '2026-10-16T13:00:00.000Z',
    };
    repository.upsert({ ...rate, date: '2026-10-14' });
    repository.upsert({ ...rate, date: '2026-10-19' });

    expect(
      repository.getMissingBusinessDates('2026-10-14', '2026-10-20'),
    ).toEqual(['2026-10-15', '2026-10-16', '2026-10-20']);
  });
});
