import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MonobankRateLimitedError,
  MonobankRateProvider,
  MonobankRateProviderError,
} from './monobank.client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('MonobankRateProvider', () => {
  it('selects and validates the USD/UAH quote without authentication', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse([
        {
          currencyCodeA: 978,
          currencyCodeB: 980,
          rateCross: 44,
        },
        {
          currencyCodeA: 840,
          currencyCodeB: 980,
          date: 1_797_000_000,
          rateBuy: 41.25,
          rateSell: 41.75,
        },
      ]),
    );
    const provider = new MonobankRateProvider({
      fetch: fetchMock,
      now: () => Date.parse('2026-10-16T13:00:00.000Z'),
    });

    await expect(provider.getRate('2026-10-16')).resolves.toMatchObject({
      date: '2026-10-16',
      currency: 'USD',
      rateBuy: 41.25,
      rateSell: 41.75,
      source: 'mono',
      fetchedAt: '2026-10-16T13:00:00.000Z',
    });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://api.monobank.ua/bank/currency',
      { signal: expect.any(AbortSignal) },
    );
    const [, options] = fetchMock.mock.calls[0] ?? [];
    expect(new Headers(options?.headers).has('Authorization')).toBe(false);
  });

  it('returns a null sell rate when Monobank omits rateSell', async () => {
    const provider = new MonobankRateProvider({
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse([
            { currencyCodeA: 840, currencyCodeB: 980, rateBuy: 41.25 },
          ]),
        ),
    });

    await expect(provider.getRate('2026-10-16')).resolves.toMatchObject({
      rateBuy: 41.25,
      rateSell: null,
    });
  });

  it('rejects invalid payloads and missing USD/UAH rates', async () => {
    const malformed = new MonobankRateProvider({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({})),
    });
    const missingPair = new MonobankRateProvider({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([])),
    });

    await expect(malformed.getRate('2026-10-16')).rejects.toBeInstanceOf(
      MonobankRateProviderError,
    );
    await expect(missingPair.getRate('2026-10-16')).rejects.toThrow(
      'does not contain a USD/UAH exchange rate',
    );
  });

  it('does not send a request for 60 seconds after HTTP 429', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            currencyCodeA: 840,
            currencyCodeB: 980,
            rateBuy: 41.25,
            rateSell: 41.75,
          },
        ]),
      );
    const provider = new MonobankRateProvider({ fetch: fetchMock });

    await expect(provider.getRate('2026-10-16')).rejects.toBeInstanceOf(
      MonobankRateLimitedError,
    );
    await expect(provider.getRate('2026-10-16')).rejects.toBeInstanceOf(
      MonobankRateLimitedError,
    );
    expect(fetchMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(60_000);
    await expect(provider.getRate('2026-10-16')).resolves.toMatchObject({
      source: 'mono',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('times out a stalled request', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const provider = new MonobankRateProvider({
      fetch: fetchMock,
      timeoutMs: 5,
    });

    await expect(provider.getRate('2026-10-16')).rejects.toBeInstanceOf(
      MonobankRateProviderError,
    );
  });
});
