import { useQuery } from '@tanstack/react-query';
import type { AnalyticsQuery, RatesQuery } from '@my-savings/shared';
import { api } from './client.js';

interface QueryOptions {
  enabled?: boolean;
}

export const queryKeys = {
  positions: ['positions'] as const,
  rates: (query: RatesQuery) => ['rates', query] as const,
  analytics: (query: AnalyticsQuery) => ['analytics', query] as const,
};

export function usePositions(options: QueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.positions,
    queryFn: api.getPositions,
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
  });
}

export function useRates(query: RatesQuery = {}) {
  return useQuery({
    queryKey: queryKeys.rates(query),
    queryFn: () => api.getRates(query),
  });
}

export function useAnalytics(
  query: AnalyticsQuery,
  options: QueryOptions = {},
) {
  return useQuery({
    queryKey: queryKeys.analytics(query),
    queryFn: () => api.getAnalytics(query),
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
  });
}
