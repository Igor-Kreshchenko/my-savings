const API_TOKEN_STORAGE_KEY = 'my-savings.api-token';

export function getApiToken(): string | undefined {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_API_TOKEN || undefined;
  }

  return (
    window.localStorage.getItem(API_TOKEN_STORAGE_KEY) ||
    import.meta.env.VITE_API_TOKEN ||
    undefined
  );
}

export function saveApiToken(token: string): void {
  const normalizedToken = token.trim();

  if (normalizedToken.length === 0) {
    window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, normalizedToken);
}

export function hasSavedApiToken(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.localStorage.getItem(API_TOKEN_STORAGE_KEY) !== null
  );
}
