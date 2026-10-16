import { rateSchema, ratesQuerySchema } from '@my-savings/shared';
import type { FastifyInstance } from 'fastify';
import { parseRequest } from '../../lib/validation.js';
import { RatesRepository } from './rates.repository.js';

export function registerRatesRoutes(
  app: FastifyInstance,
  repository: RatesRepository,
): void {
  app.get('/rates', async (request) => {
    const query = parseRequest(ratesQuerySchema, request.query);
    return repository.list(query).map((rate) => rateSchema.parse(rate));
  });
}
