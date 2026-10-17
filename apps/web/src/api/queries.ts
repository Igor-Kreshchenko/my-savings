import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnalyticsQuery,
  CreateBalanceEventInput,
  CreatePositionInput,
  RatesQuery,
} from '@my-savings/shared';
import { api } from './client.js';
import { clearPersistedQueryCache } from './query-provider.js';

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

export function useRates(query: RatesQuery = {}, options: QueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.rates(query),
    queryFn: () => api.getRates(query),
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
  });
}

export function useRateRefresh(options: QueryOptions = {}) {
  const queryClient = useQueryClient();
  const lastAttemptAt = useRef<number>();
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(0);
  const query = useQuery({
    queryKey: ['rate-refresh'],
    queryFn: api.refreshRate,
    enabled: false,
    retry: false,
  });
  const { refetch } = query;

  const refresh = useCallback(async () => {
    const now = Date.now();
    const previousAttempt = lastAttemptAt.current;
    if (
      options.enabled === false ||
      (previousAttempt !== undefined && now - previousAttempt < 60_000)
    ) {
      return;
    }

    lastAttemptAt.current = now;
    const result = await refetch();
    if (!result.isError) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['rates'] }),
      ]);
    }
  }, [options.enabled, queryClient, refetch]);

  useEffect(() => {
    if (options.enabled === false) {
      return;
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };

    void refresh();
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () =>
      document.removeEventListener('visibilitychange', refreshWhenVisible);
  }, [options.enabled, refresh]);

  useEffect(() => {
    const updateCooldown = () => {
      const elapsed = Date.now() - (lastAttemptAt.current ?? Date.now());
      setSecondsUntilRefresh(Math.max(0, Math.ceil((60_000 - elapsed) / 1000)));
    };

    updateCooldown();
    const interval = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return {
    data: query.data,
    isError: query.isError,
    isPending: query.isPending,
    isRefreshing: query.isFetching,
    refresh,
    secondsUntilRefresh,
  };
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

export function useCreateBalanceEvent(positionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBalanceEventInput) =>
      api.createBalanceEvent(positionId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['analytics'] }),
  });
}

export function useClearAllData() {
  return useMutation({
    mutationFn: api.clearAllData,
    onSuccess: clearPersistedQueryCache,
  });
}

export class InitialBalanceSaveError extends Error {
  constructor(
    public readonly positionId: number,
    causeMessage: string,
  ) {
    super(
      `Position #${positionId} was created, but its initial balance could not be saved: ${causeMessage}. Reload the page, then add the initial deposit from the balance form.`,
    );
    this.name = 'InitialBalanceSaveError';
  }
}

interface CreatePositionWithBalanceInput {
  position: CreatePositionInput;
  initialBalanceCents: number;
}

export function useCreatePositionWithInitialBalance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      position,
      initialBalanceCents,
    }: CreatePositionWithBalanceInput) => {
      const createdPosition = await api.createPosition(position);

      try {
        await api.createBalanceEvent(createdPosition.id, {
          date: position.baseDate,
          deltaCents: initialBalanceCents,
          note: 'Initial balance',
        });
      } catch (error) {
        const causeMessage =
          error instanceof Error ? error.message : 'Unknown API error';
        throw new InitialBalanceSaveError(createdPosition.id, causeMessage);
      }

      return createdPosition;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.positions }),
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      ]);
    },
  });
}
