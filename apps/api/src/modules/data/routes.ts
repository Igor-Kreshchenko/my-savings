import type { FastifyInstance } from 'fastify';
import { clearDataResponseSchema } from '@my-savings/shared';
import { DataRepository } from './data.repository.js';

export function registerDataRoutes(
  app: FastifyInstance,
  repository: DataRepository,
): void {
  app.delete('/data', async (_request, reply) => {
    repository.clearAll();
    return reply.send(clearDataResponseSchema.parse({ status: 'cleared' }));
  });
}
