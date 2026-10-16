import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const databasePath = resolve(process.env.DB_PATH ?? './data/my-savings.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma('foreign_keys = ON');

try {
  migrate(drizzle(sqlite), { migrationsFolder: './drizzle' });
  console.info(`Database migrations applied to ${databasePath}`);
} finally {
  sqlite.close();
}
