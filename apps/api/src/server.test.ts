import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from './server.js';

vi.mock('./db/client.js', () => ({
  createDatabase: () => ({
    sqlite: { close: () => undefined },
    db: {},
  }),
}));

let app: ReturnType<typeof createServer>;

beforeEach(() => {
  app = createServer(
    {
      API_TOKEN: 'test-token',
      DB_PATH: ':memory:',
      PORT: 3000,
      TZ: 'Europe/Kyiv',
    },
    { logger: false, enableRatesJobs: false },
  );
});

afterEach(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('returns the healthy status without authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
