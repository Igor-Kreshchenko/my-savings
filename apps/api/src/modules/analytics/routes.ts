import {
  analyticsQuerySchema,
  analyticsResponseSchema,
} from '@my-savings/shared';
import type { FastifyInstance } from 'fastify';
import { parseRequest } from '../../lib/validation.js';
import { AnalyticsService } from './analytics.service.js';
import type { PositionsRepository } from '../positions/positions.repository.js';
import type { RatesRepository } from '../rates/rates.repository.js';

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  positions: PositionsRepository,
  rates: RatesRepository,
): void {
  const service = new AnalyticsService(positions, rates);

  app.get('/analytics', async (request) => {
    const query = parseRequest(analyticsQuerySchema, request.query);
    return analyticsResponseSchema.parse(service.get(query));
  });
}
