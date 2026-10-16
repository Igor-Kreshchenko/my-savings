import { dateSchema, rateSchema, type Rate } from '@my-savings/shared';
import { z } from 'zod';
import type { RateProvider } from './rate-provider.js';

const nbuResponseSchema = z.array(
  z.object({
    rate: z.number().positive(),
    exchangedate: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/),
  }),
);

const NBU_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange';

export class NbuRateProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NbuRateProviderError';
  }
}

export interface NbuRateProviderOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export class NbuRateProvider implements RateProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;

  constructor(options: NbuRateProviderOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 250;

    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive integer');
    }
    if (!Number.isInteger(this.retries) || this.retries < 0) {
      throw new RangeError('retries must be a non-negative integer');
    }
    if (!Number.isInteger(this.retryDelayMs) || this.retryDelayMs < 0) {
      throw new RangeError('retryDelayMs must be a non-negative integer');
    }
  }

  async getRate(date: string): Promise<Rate | null> {
    const validDate = dateSchema.parse(date);
    const nbuDate = validDate.replaceAll('-', '');
    const url = new URL(NBU_URL);
    url.search = new URLSearchParams({
      valcode: 'USD',
      date: nbuDate,
      json: '',
    }).toString();

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const entries = await this.fetchRate(url);
        const entry = entries[0];
        if (entry === undefined) {
          return null;
        }

        const expectedExchangeDate = `${validDate.slice(8, 10)}.${validDate.slice(5, 7)}.${validDate.slice(0, 4)}`;
        if (entry.exchangedate !== expectedExchangeDate) {
          throw new NbuRateProviderError(
            `NBU returned ${entry.exchangedate} for requested date ${validDate}`,
          );
        }

        return rateSchema.parse({
          date: validDate,
          currency: 'USD',
          rate: entry.rate,
          source: 'NBU',
          fetchedAt: new Date().toISOString(),
        });
      } catch (error) {
        lastError = error;
        if (attempt === this.retries) {
          break;
        }
        await this.delay(this.retryDelayMs * 2 ** attempt);
      }
    }

    throw new NbuRateProviderError(
      `Failed to fetch the NBU USD rate for ${validDate} after ${this.retries + 1} attempts`,
      { cause: lastError },
    );
  }

  private async fetchRate(
    url: URL,
  ): Promise<z.infer<typeof nbuResponseSchema>> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(
          new NbuRateProviderError(
            `NBU request timed out after ${this.timeoutMs} ms`,
          ),
        );
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([
        (async () => {
          const response = await this.fetchImpl(url, {
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new NbuRateProviderError(
              `NBU request failed with HTTP status ${response.status}`,
            );
          }

          const payload: unknown = await response.json();
          return nbuResponseSchema.parse(payload);
        })(),
        timeoutPromise,
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
