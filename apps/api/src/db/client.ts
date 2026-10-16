import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { AppConfig } from '../config.js';
import * as schema from './schema.js';

export function createDatabase(config: Pick<AppConfig, 'DB_PATH'>) {
  const databasePath =
    config.DB_PATH === ':memory:' ? config.DB_PATH : resolve(config.DB_PATH);
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const sqlite = new Database(databasePath);
  sqlite.pragma('foreign_keys = ON');
  try {
    const db = drizzle(sqlite, { schema });
    migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL('../../drizzle', import.meta.url),
      ),
    });

    return { sqlite, db };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof createDatabase>['db'];
  }
}
