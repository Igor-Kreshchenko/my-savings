import { describe, expect, it } from 'vitest';
import { parseUsdAmountToCents } from './parse-usd-cents.js';

describe('parseUsdAmountToCents', () => {
  it.each([
    ['1', 100],
    ['12.3', 1230],
    ['12.34', 1234],
    [' 0012.34 ', 1234],
  ])('parses %s as integer cents', (value, expected) => {
    expect(parseUsdAmountToCents(value)).toBe(expected);
  });

  it.each(['', '0', '0.00', '-1', '1.234', '1e2', '1.'])(
    'rejects invalid amount %s',
    (value) => {
      expect(parseUsdAmountToCents(value)).toBeNull();
    },
  );

  it('rejects amounts above the safe integer range', () => {
    expect(parseUsdAmountToCents('90071992547410')).toBeNull();
  });
});
