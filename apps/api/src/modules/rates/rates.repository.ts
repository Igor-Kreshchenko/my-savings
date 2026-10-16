import type { Rate, RatesQuery } from '@my-savings/shared';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import type { createDatabase } from '../../db/client.js';
import { rates } from '../../db/schema.js';
import { listWeekdays } from '../../lib/dates.js';

type RatesDatabase = ReturnType<typeof createDatabase>['db'];

export class RatesRepository {
  constructor(private readonly db: RatesDatabase) {}

  upsert(rate: Rate): void {
    this.db
      .insert(rates)
      .values(rate)
      .onConflictDoUpdate({
        target: [rates.date, rates.currency],
        set: {
          rate: rate.rate,
          source: rate.source,
          fetchedAt: rate.fetchedAt,
        },
      })
      .run();
  }

  getLatestDate(currency = 'USD'): string | undefined {
    const result = this.db
      .select({ date: rates.date })
      .from(rates)
      .where(eq(rates.currency, currency))
      .orderBy(desc(rates.date))
      .limit(1)
      .get();
    return result?.date;
  }

  list(query: RatesQuery, currency = 'USD'): Rate[] {
    const conditions = [eq(rates.currency, currency)];
    if (query.from !== undefined) {
      conditions.push(gte(rates.date, query.from));
    }
    if (query.to !== undefined) {
      conditions.push(lte(rates.date, query.to));
    }

    return this.db
      .select()
      .from(rates)
      .where(and(...conditions))
      .orderBy(asc(rates.date))
      .all();
  }

  listThrough(date: string, currency = 'USD'): Rate[] {
    return this.db
      .select()
      .from(rates)
      .where(and(eq(rates.currency, currency), lte(rates.date, date)))
      .orderBy(asc(rates.date))
      .all();
  }

  getMissingBusinessDates(
    from: string,
    to: string,
    currency = 'USD',
  ): string[] {
    if (from > to) {
      return [];
    }

    const existingDates = new Set(
      this.db
        .select({ date: rates.date })
        .from(rates)
        .where(
          and(
            eq(rates.currency, currency),
            gte(rates.date, from),
            lte(rates.date, to),
          ),
        )
        .all()
        .map(({ date }) => date),
    );

    return listWeekdays(from, to).filter((date) => !existingDates.has(date));
  }
}
