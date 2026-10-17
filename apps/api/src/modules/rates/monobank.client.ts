import { dateSchema, rateSchema, type Rate } from '@my-savings/shared';
import { z } from 'zod';
import type { RateProvider } from './rate-provider.js';

const monobankResponseSchema = z.array(
  z
    .object({
      currencyCodeA: z.number().int(),
      currencyCodeB: z.number().int(),
      rateBuy: z.number().positive().optional(),
      rateSell: z.number().positive().optional(),
    })
    .passthrough(),
);

const MONOBANK_URL = 'https://api.monobank.ua/bank/currency';
const USD_CODE = 840;
const UAH_CODE = 980;
const RATE_LIMIT_COOLDOWN_MS = 60_000;

export class MonobankRateProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MonobankRateProviderError';
  }
}

export class MonobankRateLimitedError extends MonobankRateProviderError {
  constructor() {
    super('Monobank rate limit reached; requests are paused for 60 seconds');
    this.name = 'MonobankRateLimitedError';
  }
}

export interface MonobankRateProviderOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

export class MonobankRateProvider implements RateProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private blockedUntil = 0;

  constructor(options: MonobankRateProviderOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.now = options.now ?? Date.now;

    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive integer');
    }
  }

  async getRate(date: string): Promise<Rate | null> {
    const validDate = dateSchema.parse(date);
    if (this.now() < this.blockedUntil) {
      throw new MonobankRateLimitedError();
    }

    const response = await this.fetchRate();
    let entries: z.infer<typeof monobankResponseSchema>;
    try {
      entries = monobankResponseSchema.parse(response);
    } catch (error) {
      throw new MonobankRateProviderError(
        'Monobank returned an invalid currency response',
        { cause: error },
      );
    }
    const usdUahEntry = entries.find(
      ({ currencyCodeA, currencyCodeB }) =>
        currencyCodeA === USD_CODE && currencyCodeB === UAH_CODE,
    );

    if (usdUahEntry === undefined) {
      throw new MonobankRateProviderError(
        'Monobank response does not contain a USD/UAH exchange rate',
      );
    }
    if (usdUahEntry.rateBuy === undefined) {
      throw new MonobankRateProviderError(
        'Monobank USD/UAH entry does not contain rateBuy',
      );
    }

    return rateSchema.parse({
      date: validDate,
      currency: 'USD',
      rateBuy: usdUahEntry.rateBuy,
      rateSell: usdUahEntry.rateSell ?? null,
      source: 'mono',
      fetchedAt: new Date(this.now()).toISOString(),
    });
  }

  private async fetchRate(): Promise<unknown> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(
          new MonobankRateProviderError(
            `Monobank request timed out after ${this.timeoutMs} ms`,
          ),
        );
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([
        (async () => {
          const response = await this.fetchImpl(MONOBANK_URL, {
            signal: controller.signal,
          });
          if (response.status === 429) {
            this.blockedUntil = this.now() + RATE_LIMIT_COOLDOWN_MS;
            throw new MonobankRateLimitedError();
          }
          if (!response.ok) {
            throw new MonobankRateProviderError(
              `Monobank request failed with HTTP status ${response.status}`,
            );
          }

          const payload: unknown = await response.json();
          return payload;
        })(),
        timeoutPromise,
      ]);
    } catch (error) {
      if (error instanceof MonobankRateProviderError) {
        throw error;
      }
      throw new MonobankRateProviderError(
        'Failed to fetch the Monobank USD/UAH rate',
        { cause: error },
      );
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }
}
