import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './client.js';

const localValues = new Map<string, string>();
const localStorageMock = {
  getItem(key: string): string | null {
    return localValues.get(key) ?? null;
  },
  removeItem(key: string): void {
    localValues.delete(key);
  },
  setItem(key: string, value: string): void {
    localValues.set(key, value);
  },
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  localValues.clear();
  fetchMock.mockReset();
  vi.stubGlobal('window', { localStorage: localStorageMock });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API client', () => {
  it('clears all server data with an authenticated DELETE request', async () => {
    localValues.set('my-savings.api-token', 'test-token');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'cleared' }), { status: 200 }),
    );

    await expect(api.clearAllData()).resolves.toEqual({ status: 'cleared' });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('/api/data');
    expect(init?.method).toBe('DELETE');
    expect(new Headers(init?.headers).has('Authorization')).toBe(true);
  });

  it('refreshes the stored Monobank rate with an authenticated POST', async () => {
    localValues.set('my-savings.api-token', 'test-token');
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          date: '2026-10-16',
          rateBuy: 41.5,
          rateSell: 41.7,
          fetchedAt: '2026-10-16T13:00:00.000Z',
          stale: false,
        }),
        { status: 200 },
      ),
    );

    await expect(api.refreshRate()).resolves.toEqual({
      date: '2026-10-16',
      rateBuy: 41.5,
      rateSell: 41.7,
      fetchedAt: '2026-10-16T13:00:00.000Z',
      stale: false,
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('/api/rates/refresh');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer test-token',
    );
  });

  it('sends the saved bearer token and validates successful responses', async () => {
    localValues.set('my-savings.api-token', 'test-token');
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 1,
            currency: 'USD',
            baseDate: '2026-10-16',
            baseRate: 41.25,
            note: null,
          },
        ]),
        { status: 200 },
      ),
    );

    await expect(api.getPositions()).resolves.toEqual([
      {
        id: 1,
        currency: 'USD',
        baseDate: '2026-10-16',
        baseRate: 41.25,
        note: null,
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('/api/positions');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer test-token',
    );
  });

  it('creates a USD position with its base date and rate', async () => {
    localValues.set('my-savings.api-token', 'test-token');
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 3,
          currency: 'USD',
          baseDate: '2026-10-16',
          baseRate: 41.25,
          note: 'Savings',
        }),
        { status: 201 },
      ),
    );

    await expect(
      api.createPosition({
        currency: 'USD',
        baseDate: '2026-10-16',
        baseRate: 41.25,
        note: 'Savings',
      }),
    ).resolves.toMatchObject({ id: 3, baseRate: 41.25 });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('/api/positions');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      currency: 'USD',
      baseDate: '2026-10-16',
      baseRate: 41.25,
      note: 'Savings',
    });
  });

  it('rejects successful responses that do not match the shared schema', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ id: 'not-a-number' }]), { status: 200 }),
    );

    await expect(api.getPositions()).rejects.toThrow();
  });

  it('preserves structured API errors', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is missing or invalid',
          },
        }),
        { status: 401 },
      ),
    );

    await expect(api.getPositions()).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Authorization header is missing or invalid',
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });
});
