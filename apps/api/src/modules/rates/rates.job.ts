import cron, { type ScheduledTask } from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import type { RatesService } from './rates.service.js';

export const RATES_CRON_EXPRESSION = '0 */3 * * *';
export const RATES_CRON_TIMEZONE = 'Europe/Kyiv';
export const RATES_JOB_RETRIES = 3;
export const RATES_JOB_RETRY_DELAY_MS = 10 * 60 * 1000;

interface RetryOptions {
  maxRetries: number;
  retryDelayMs: number;
  delay?: (milliseconds: number) => Promise<void>;
  onRetry?: (error: unknown, retry: number) => void;
}

export async function runWithRetries(
  operation: () => Promise<unknown>,
  options: RetryOptions,
): Promise<void> {
  if (!Number.isInteger(options.maxRetries) || options.maxRetries < 0) {
    throw new RangeError('maxRetries must be a non-negative integer');
  }
  if (!Number.isInteger(options.retryDelayMs) || options.retryDelayMs < 0) {
    throw new RangeError('retryDelayMs must be a non-negative integer');
  }

  const delay =
    options.delay ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 0; ; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      if (attempt >= options.maxRetries) {
        throw error;
      }
      options.onRetry?.(error, attempt + 1);
      await delay(options.retryDelayMs);
    }
  }
}

export function startRatesJob(
  service: Pick<RatesService, 'updateToday'>,
  logger: FastifyBaseLogger,
  timeZone = RATES_CRON_TIMEZONE,
): ScheduledTask {
  return cron.schedule(
    RATES_CRON_EXPRESSION,
    async () => {
      try {
        await runWithRetries(() => service.updateToday(), {
          maxRetries: RATES_JOB_RETRIES,
          retryDelayMs: RATES_JOB_RETRY_DELAY_MS,
          onRetry: (error, retry) => {
            logger.warn(
              {
                err: error,
                retry,
                retryDelayMs: RATES_JOB_RETRY_DELAY_MS,
              },
              'Rate update failed; retrying in 10 minutes',
            );
          },
        });
        logger.info('Scheduled rate update completed');
      } catch (error) {
        logger.error(
          { err: error },
          'Scheduled rate update failed after 3 retries',
        );
      }
    },
    { timezone: timeZone },
  );
}
