import {
  balanceEventSchema,
  createBalanceEventSchema,
  createPositionSchema,
  positionSchema,
} from '@my-savings/shared';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { parseRequest } from '../../lib/validation.js';
import type { RatesService } from '../rates/rates.service.js';
import { PositionsRepository } from './positions.repository.js';
import { PositionsService } from './positions.service.js';

export function registerPositionRoutes(
  app: FastifyInstance,
  repository: PositionsRepository,
  ratesService: RatesService,
): void {
  const service = new PositionsService(repository, ratesService);

  app.get('/positions', async () =>
    service.list().map((position) => positionSchema.parse(position)),
  );

  app.post('/positions', async (request, reply) => {
    const input = parseRequest(createPositionSchema, request.body);
    const position = await service.create(input);
    return reply.code(201).send(positionSchema.parse(position));
  });

  app.post('/positions/:id/events', async (request, reply) => {
    const { id } = parseRequest(
      z.object({ id: z.coerce.number().int().positive() }),
      request.params,
    );
    const input = parseRequest(createBalanceEventSchema, request.body);
    const event = await service.createEvent(id, input);
    return reply.code(201).send(balanceEventSchema.parse(event));
  });
}
