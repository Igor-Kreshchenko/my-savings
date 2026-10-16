const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

export function parseUsdAmountToCents(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (match === null) {
    return null;
  }

  const wholeDollars = match[1];
  const fractionalDollars = match[2] ?? '';
  if (wholeDollars === undefined) {
    return null;
  }

  const cents =
    BigInt(wholeDollars) * 100n +
    BigInt(fractionalDollars.padEnd(2, '0') || '0');

  if (cents <= 0n || cents > MAX_SAFE_CENTS) {
    return null;
  }

  return Number(cents);
}
