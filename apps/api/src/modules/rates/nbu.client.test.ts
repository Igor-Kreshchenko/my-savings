import { describe, expect, it, vi } from 'vitest';
import { NbuRateProvider, NbuRateProviderError } from './nbu.client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('NbuRateProvider', () => {
  it('fetches and validates a USD rate', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse([{ rate: 41.25, exchangedate: '16.10.2026' }]),
      );
    const provider = new NbuRateProvider({ fetch: fetchMock });

    const result = await provider.getRate('2026-10-16');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [requestUrl] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(requestUrl)).searchParams.get('valcode')).toBe('USD');
    expect(new URL(String(requestUrl)).searchParams.get('date')).toBe(
      '20261016',
    );
    expect(result).toMatchObject({
      date: '2026-10-16',
      currency: 'USD',
      rate: 41.25,
      source: 'NBU',
    });
    expect(result?.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns null when NBU has no rate for the date', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]));
    const provider = new NbuRateProvider({ fetch: fetchMock });

    await expect(provider.getRate('2026-10-17')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('retries network failures and rejects after exhausting attempts', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('network unavailable'));
    const provider = new NbuRateProvider({
      fetch: fetchMock,
      retries: 2,
      retryDelayMs: 0,
    });

    await expect(provider.getRate('2026-10-16')).rejects.toBeInstanceOf(
      NbuRateProviderError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns a rate after a transient network failure', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(
        jsonResponse([{ rate: 41.25, exchangedate: '16.10.2026' }]),
      );
    const provider = new NbuRateProvider({
      fetch: fetchMock,
      retries: 1,
      retryDelayMs: 0,
    });

    await expect(provider.getRate('2026-10-16')).resolves.toMatchObject({
      rate: 41.25,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('times out a stalled NBU request', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const provider = new NbuRateProvider({
      fetch: fetchMock,
      timeoutMs: 5,
      retries: 0,
    });

    await expect(provider.getRate('2026-10-16')).rejects.toBeInstanceOf(
      NbuRateProviderError,
    );
  });
});
