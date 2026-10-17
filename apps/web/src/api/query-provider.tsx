import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  hydrate,
} from '@tanstack/react-query';
import type { DehydratedState } from '@tanstack/react-query';
import { useEffect, type PropsWithChildren } from 'react';

const QUERY_CACHE_STORAGE_KEY = 'my-savings.query-cache';
const QUERY_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: QUERY_CACHE_MAX_AGE,
      retry: 1,
    },
  },
});

function isDehydratedState(value: unknown): value is DehydratedState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'mutations' in value &&
    Array.isArray(value.mutations) &&
    'queries' in value &&
    Array.isArray(value.queries)
  );
}

function restoreQueryCache(): void {
  const serializedCache = window.localStorage.getItem(QUERY_CACHE_STORAGE_KEY);

  if (serializedCache === null) {
    return;
  }

  try {
    const parsedCache: unknown = JSON.parse(serializedCache);
    if (isDehydratedState(parsedCache)) {
      hydrate(queryClient, parsedCache);
    } else {
      console.error('Saved query cache has an invalid format');
    }
  } catch (error) {
    console.error('Failed to restore the saved query cache', error);
  }
}

if (typeof window !== 'undefined') {
  restoreQueryCache();
}

function persistQueryCache(): void {
  try {
    window.localStorage.setItem(
      QUERY_CACHE_STORAGE_KEY,
      JSON.stringify(dehydrate(queryClient)),
    );
  } catch (error) {
    console.error('Failed to persist the query cache', error);
  }
}

export async function clearPersistedQueryCache(): Promise<void> {
  queryClient.removeQueries();
  window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
  if ('caches' in window) {
    await window.caches.delete('api-get-cache');
  }
}

export function QueryProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    const unsubscribe = queryClient
      .getQueryCache()
      .subscribe(persistQueryCache);

    return unsubscribe;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
