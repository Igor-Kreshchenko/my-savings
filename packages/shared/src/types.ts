import type { z } from 'zod';
import type {
  analyticsQuerySchema,
  analyticsResponseSchema,
  balanceEventSchema,
  clearDataResponseSchema,
  createBalanceEventSchema,
  createPositionSchema,
  positionSchema,
  rateSchema,
  ratesQuerySchema,
} from './schemas.js';

export type Rate = z.infer<typeof rateSchema>;
export type Position = z.infer<typeof positionSchema>;
export type BalanceEvent = z.infer<typeof balanceEventSchema>;
export type CreatePositionInput = z.infer<typeof createPositionSchema>;
export type CreateBalanceEventInput = z.infer<typeof createBalanceEventSchema>;
export type RatesQuery = z.infer<typeof ratesQuerySchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;
export type ClearDataResponse = z.infer<typeof clearDataResponseSchema>;
