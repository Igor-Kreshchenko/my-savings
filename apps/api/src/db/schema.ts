import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const rates = sqliteTable(
  'rates',
  {
    date: text('date').notNull(),
    currency: text('currency').notNull(),
    rateBuy: real('rate_buy').notNull(),
    rateSell: real('rate_sell'),
    source: text('source').notNull(),
    fetchedAt: text('fetched_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.date, table.currency, table.source] }),
  ],
);

export const positions = sqliteTable('positions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  currency: text('currency').notNull(),
  baseDate: text('base_date').notNull(),
  baseRate: real('base_rate').notNull(),
  note: text('note'),
});

export const balanceEvents = sqliteTable('balance_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  positionId: integer('position_id')
    .notNull()
    .references(() => positions.id),
  date: text('date').notNull(),
  deltaCents: integer('delta_cents').notNull(),
  note: text('note'),
});
