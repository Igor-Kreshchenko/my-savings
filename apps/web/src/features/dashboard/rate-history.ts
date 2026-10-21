import type { Rate } from '@my-savings/shared';

export type RateSortDirection = 'asc' | 'desc';

export function sortRatesByDate(
  rates: readonly Rate[],
  direction: RateSortDirection,
): Rate[] {
  const dateOrder = direction === 'asc' ? 1 : -1;
  return [...rates].sort((left, right) => {
    const dateComparison = left.date.localeCompare(right.date) * dateOrder;
    return dateComparison || left.source.localeCompare(right.source);
  });
}

export function getRateHistoryPage(
  rates: readonly Rate[],
  page: number,
  pageSize: number,
): Rate[] {
  if (!Number.isInteger(page) || page < 0) {
    throw new RangeError('page must be a non-negative integer');
  }
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new RangeError('pageSize must be a positive integer');
  }

  return rates.slice(page * pageSize, (page + 1) * pageSize);
}
