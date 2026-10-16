import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('loads validated configuration with defaults', () => {
    expect(loadConfig({ API_TOKEN: 'test-token' })).toEqual({
      API_TOKEN: 'test-token',
      DB_PATH: './data/my-savings.sqlite',
      PORT: 3000,
      TZ: 'Europe/Kyiv',
    });
  });

  it('rejects missing tokens and invalid ports', () => {
    expect(() => loadConfig({})).toThrow();
    expect(() =>
      loadConfig({ API_TOKEN: 'test-token', PORT: '70000' }),
    ).toThrow();
  });
});
