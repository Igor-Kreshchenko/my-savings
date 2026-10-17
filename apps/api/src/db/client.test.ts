import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from './client.js';
import { rates } from './schema.js';

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

describe('createDatabase', () => {
  it('applies migrations before returning a newly created database', () => {
    const database = createDatabase({ DB_PATH: ':memory:' });
    databases.push(database.sqlite);

    const tables = database.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('rates', 'positions', 'balance_events') ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    expect(tables.map(({ name }) => name)).toEqual([
      'balance_events',
      'positions',
      'rates',
    ]);
  });

  it('can safely apply migrations more than once', () => {
    const database = createDatabase({ DB_PATH: ':memory:' });
    databases.push(database.sqlite);

    migrate(database.db, {
      migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
    });

    expect(() => database.db.select().from(rates).all()).not.toThrow();
  });

  it('migrates legacy rates to NBU buy rates and source-specific keys', () => {
    const sqlite = new Database(':memory:');
    databases.push(sqlite);
    sqlite.exec(`
      CREATE TABLE rates (
        date TEXT NOT NULL,
        currency TEXT NOT NULL,
        rate REAL NOT NULL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (date, currency)
      );
      INSERT INTO rates VALUES (
        '2026-10-16', 'USD', 41.25, 'NBU', '2026-10-16T13:00:00.000Z'
      );
    `);
    const migration = readFileSync(
      new URL('../../drizzle/0001_monobank_rates.sql', import.meta.url),
      'utf8',
    ).replaceAll('--> statement-breakpoint', '');

    sqlite.exec(migration);

    expect(
      sqlite
        .prepare(
          'SELECT date, currency, rate_buy, rate_sell, source, fetched_at FROM rates',
        )
        .all(),
    ).toEqual([
      {
        date: '2026-10-16',
        currency: 'USD',
        rate_buy: 41.25,
        rate_sell: null,
        source: 'nbu',
        fetched_at: '2026-10-16T13:00:00.000Z',
      },
    ]);
  });
});
