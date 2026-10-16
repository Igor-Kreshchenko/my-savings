import { dateSchema, type Rate } from '@my-savings/shared';
import { addCalendarDays, getTodayInTimezone } from '../../lib/dates.js';
import type { RateProvider } from './rate-provider.js';
import type { RatesRepository } from './rates.repository.js';

export interface RateSyncResult {
  attempted: number;
  stored: number;
  unavailable: number;
}

export class RatesService {
  constructor(
    private readonly repository: RatesRepository,
    private readonly provider: RateProvider,
    private readonly getToday: () => string = () =>
      getTodayInTimezone('Europe/Kyiv'),
  ) {}

  async catchUp(): Promise<RateSyncResult> {
    const today = dateSchema.parse(this.getToday());
    const latestDate = this.repository.getLatestDate('USD');
    const from =
      latestDate === undefined ? today : addCalendarDays(latestDate, 1);

    return this.syncMissingDates(from, today);
  }

  async backfill(from: string): Promise<RateSyncResult> {
    return this.syncMissingDates(dateSchema.parse(from), this.getToday());
  }

  private async syncMissingDates(
    from: string,
    to: string,
  ): Promise<RateSyncResult> {
    const validTo = dateSchema.parse(to);
    const dates = this.repository.getMissingBusinessDates(
      dateSchema.parse(from),
      validTo,
      'USD',
    );
    const result: RateSyncResult = {
      attempted: dates.length,
      stored: 0,
      unavailable: 0,
    };

    for (const date of dates) {
      const rate = await this.provider.getRate(date);
      if (rate === null) {
        result.unavailable += 1;
        continue;
      }
      this.assertRequestedRate(rate, date);
      this.repository.upsert(rate);
      result.stored += 1;
    }

    return result;
  }

  private assertRequestedRate(rate: Rate, requestedDate: string): void {
    if (rate.date !== requestedDate || rate.currency !== 'USD') {
      throw new Error(
        `Rate provider returned ${rate.currency} for ${rate.date}; expected USD for ${requestedDate}`,
      );
    }
  }
}
