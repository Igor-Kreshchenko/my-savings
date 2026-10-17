import {
  dateSchema,
  type Rate,
  type RateRefreshResponse,
} from '@my-savings/shared';
import { addCalendarDays, getTodayInTimezone } from '../../lib/dates.js';
import { AppError } from '../../lib/app-error.js';
import type { RateProvider } from './rate-provider.js';
import type { RatesRepository } from './rates.repository.js';

export interface RateSyncResult {
  attempted: number;
  stored: number;
  unavailable: number;
}

export class RatesService {
  private refreshPromise: Promise<RateRefreshResponse> | undefined;
  private lastMonobankRequestAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly repository: RatesRepository,
    private readonly provider: RateProvider,
    private readonly getToday: () => string = () =>
      getTodayInTimezone('Europe/Kyiv'),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async catchUp(): Promise<RateSyncResult> {
    const today = dateSchema.parse(this.getToday());
    const latestDate = this.repository.getLatestDate('USD', 'nbu');
    const from =
      latestDate === undefined ? today : addCalendarDays(latestDate, 1);

    return this.syncMissingDates(from, today);
  }

  async backfill(from: string): Promise<RateSyncResult> {
    return this.syncMissingDates(dateSchema.parse(from), this.getToday());
  }

  async updateToday(): Promise<RateSyncResult> {
    const result = await this.refreshMonobank();
    return {
      attempted: 1,
      stored: result.stale ? 0 : 1,
      unavailable: result.stale ? 1 : 0,
    };
  }

  refreshMonobank(): Promise<RateRefreshResponse> {
    if (this.refreshPromise !== undefined) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refreshMonobankOnce().finally(() => {
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }

  private async refreshMonobankOnce(): Promise<RateRefreshResponse> {
    const latestRate = this.repository.getLatestRate('USD', 'mono');
    const now = this.now();
    const latestRateAge =
      latestRate === undefined
        ? Number.POSITIVE_INFINITY
        : now.getTime() - Date.parse(latestRate.fetchedAt);

    if (
      latestRate !== undefined &&
      latestRateAge >= 0 &&
      latestRateAge < 300_000
    ) {
      return this.toRefreshResponse(latestRate, false);
    }

    if (now.getTime() - this.lastMonobankRequestAt < 60_000) {
      return this.toStaleResponse(latestRate);
    }

    this.lastMonobankRequestAt = now.getTime();
    const today = dateSchema.parse(this.getToday());

    let fetchedRate: Rate | null;
    try {
      fetchedRate = await this.provider.getRate(today);
    } catch {
      return this.toStaleResponse(latestRate);
    }
    if (fetchedRate === null) {
      return this.toStaleResponse(latestRate);
    }

    this.assertRequestedRate(fetchedRate, today, 'mono');
    const storedRate: Rate = {
      ...fetchedRate,
      fetchedAt: this.now().toISOString(),
    };
    this.repository.upsert(storedRate);
    return this.toRefreshResponse(storedRate, false);
  }

  private toStaleResponse(rate: Rate | undefined): RateRefreshResponse {
    if (rate === undefined) {
      throw new AppError(
        'No stored Monobank rate is available while the provider is unavailable',
        503,
        'RATE_REFRESH_UNAVAILABLE',
      );
    }
    return this.toRefreshResponse(rate, true);
  }

  private toRefreshResponse(rate: Rate, stale: boolean): RateRefreshResponse {
    return {
      date: rate.date,
      rateBuy: rate.rateBuy,
      rateSell: rate.rateSell,
      fetchedAt: rate.fetchedAt,
      stale,
    };
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
      'nbu',
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
      this.assertRequestedRate(rate, date, 'nbu');
      this.repository.upsert(rate);
      result.stored += 1;
    }

    return result;
  }

  private assertRequestedRate(
    rate: Rate,
    requestedDate: string,
    expectedSource: 'nbu' | 'mono',
  ): void {
    if (
      rate.date !== requestedDate ||
      rate.currency !== 'USD' ||
      rate.source !== expectedSource
    ) {
      throw new Error(
        `Rate provider returned ${rate.currency}/${rate.source} for ${rate.date}; expected USD/${expectedSource} for ${requestedDate}`,
      );
    }
  }
}
