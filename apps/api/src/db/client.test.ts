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
});
