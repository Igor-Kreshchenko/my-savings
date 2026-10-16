import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AnalyticsQuery,
  CreateBalanceEventInput,
  CreatePositionInput,
  RatesQuery,
} from '@my-savings/shared';
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

export function useRates(query: RatesQuery = {}, options: QueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.rates(query),
    queryFn: () => api.getRates(query),
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
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

export function useCreateBalanceEvent(positionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBalanceEventInput) =>
      api.createBalanceEvent(positionId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['analytics'] }),
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
