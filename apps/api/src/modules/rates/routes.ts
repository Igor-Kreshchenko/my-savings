import {
  rateRefreshResponseSchema,
  rateSchema,
  ratesQuerySchema,
} from '@my-savings/shared';
import type { FastifyInstance } from 'fastify';
import { parseRequest } from '../../lib/validation.js';
import { RatesRepository } from './rates.repository.js';
import type { RatesService } from './rates.service.js';

export function registerRatesRoutes(
  app: FastifyInstance,
  repository: RatesRepository,
  service: RatesService,
): void {
  app.get('/rates', async (request) => {
    const query = parseRequest(ratesQuerySchema, request.query);
    return repository.list(query).map((rate) => rateSchema.parse(rate));
  });

  app.post('/rates/refresh', async (request) => {
    const result = rateRefreshResponseSchema.parse(
      await service.refreshMonobank(),
    );
    if (result.stale) {
      request.log.warn(
        { fetchedAt: result.fetchedAt },
        'Serving a stale Monobank rate after refresh was skipped or failed',
      );
    }
    return result;
  });
}
