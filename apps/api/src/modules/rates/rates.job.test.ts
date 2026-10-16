import { describe, expect, it, vi } from 'vitest';
import {
  RATES_CRON_EXPRESSION,
  RATES_JOB_RETRIES,
  RATES_CRON_TIMEZONE,
  runWithRetries,
} from './rates.job.js';

describe('rates job', () => {
  it('uses the weekday 16:00 schedule in Europe/Kyiv', () => {
    expect(RATES_CRON_EXPRESSION).toBe('0 16 * * 1-5');
    expect(RATES_CRON_TIMEZONE).toBe('Europe/Kyiv');
  });

  it('retries a failed operation and resolves after it succeeds', async () => {
    const operation = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);
    const delay = vi.fn(async () => undefined);
    const onRetry = vi.fn();

    await runWithRetries(operation, {
      maxRetries: RATES_JOB_RETRIES,
      retryDelayMs: 600_000,
      delay,
      onRetry,
    });

    expect(operation).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(600_000);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('rejects after the initial attempt and three retries', async () => {
    const failure = new Error('NBU unavailable');
    const operation = vi.fn<() => Promise<void>>().mockRejectedValue(failure);
    const delay = vi.fn(async () => undefined);
    const onRetry = vi.fn();

    await expect(
      runWithRetries(operation, {
        maxRetries: RATES_JOB_RETRIES,
        retryDelayMs: 600_000,
        delay,
        onRetry,
      }),
    ).rejects.toBe(failure);

    expect(operation).toHaveBeenCalledTimes(4);
    expect(delay).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(3);
  });
});
