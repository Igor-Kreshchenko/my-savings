import {
  analyticsQuerySchema,
  analyticsResponseSchema,
  balanceEventSchema,
  clearDataResponseSchema,
  createBalanceEventSchema,
  createPositionSchema,
  positionSchema,
  rateSchema,
  ratesQuerySchema,
} from '@my-savings/shared';
import type {
  AnalyticsQuery,
  AnalyticsResponse,
  BalanceEvent,
  ClearDataResponse,
  CreateBalanceEventInput,
  CreatePositionInput,
  Position,
  Rate,
  RatesQuery,
} from '@my-savings/shared';
import { getApiToken } from './settings.js';

interface RuntimeSchema<T> {
  parse(value: unknown): T;
}

interface ApiErrorPayload {
  code: string;
  message: string;
}

function arraySchema<T>(itemSchema: RuntimeSchema<T>): RuntimeSchema<T[]> {
  return {
    parse(value: unknown): T[] {
      if (!Array.isArray(value)) {
        throw new TypeError('The API response must be an array');
      }

      return value.map((item: unknown) => itemSchema.parse(item));
    },
  };
}

function parseApiError(value: unknown): ApiErrorPayload | undefined {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return undefined;
  }

  const error = value.error;
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    !('message' in error) ||
    typeof error.code !== 'string' ||
    typeof error.message !== 'string'
  ) {
    return undefined;
  }

  return { code: error.code, message: error.message };
}

const positionsSchema = arraySchema(positionSchema);
const ratesSchema = arraySchema(rateSchema);
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(
  /\/+$/,
  '',
);

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function requestJson<T>(
  path: string,
  schema: RuntimeSchema<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getApiToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiError(
        'The API returned invalid JSON',
        response.status,
        'INVALID_RESPONSE',
      );
    }
    throw error;
  }

  if (!response.ok) {
    const parsedError = parseApiError(payload);
    throw new ApiError(
      parsedError?.message ?? `Request failed with status ${response.status}`,
      response.status,
      parsedError?.code ?? 'REQUEST_FAILED',
    );
  }

  return schema.parse(payload);
}

function toSearchParams(
  values: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query.length > 0 ? `?${query}` : '';
}

export const api = {
  clearAllData(): Promise<ClearDataResponse> {
    return requestJson('/data', clearDataResponseSchema, { method: 'DELETE' });
  },

  getPositions(): Promise<Position[]> {
    return requestJson('/positions', positionsSchema);
  },

  createPosition(input: CreatePositionInput): Promise<Position> {
    const body = createPositionSchema.parse(input);
    return requestJson('/positions', positionSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  createBalanceEvent(
    positionId: number,
    input: CreateBalanceEventInput,
  ): Promise<BalanceEvent> {
    if (!Number.isSafeInteger(positionId) || positionId <= 0) {
      throw new RangeError('Position ID must be a positive safe integer');
    }

    const body = createBalanceEventSchema.parse(input);
    return requestJson(`/positions/${positionId}/events`, balanceEventSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  getRates(query: RatesQuery = {}): Promise<Rate[]> {
    const validatedQuery = ratesQuerySchema.parse(query);
    return requestJson(`/rates${toSearchParams(validatedQuery)}`, ratesSchema);
  },

  getAnalytics(query: AnalyticsQuery): Promise<AnalyticsResponse> {
    const validatedQuery = analyticsQuerySchema.parse(query);
    return requestJson(
      `/analytics${toSearchParams(validatedQuery)}`,
      analyticsResponseSchema,
    );
  },
};
