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
    expect(url).toBe('/api/positions');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer test-token',
    );
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
