import type {
  BalanceEvent,
  CreateBalanceEventInput,
  CreatePositionInput,
  Position,
} from '@my-savings/shared';
import { AppError } from '../../lib/app-error.js';
import type { RatesService } from '../rates/rates.service.js';
import { PositionsRepository } from './positions.repository.js';

export class PositionsService {
  constructor(
    private readonly repository: PositionsRepository,
    private readonly ratesService: RatesService,
  ) {}

  list(): Position[] {
    return this.repository.list();
  }

  async create(input: CreatePositionInput): Promise<Position> {
    if (input.currency !== 'USD') {
      throw new AppError(
        'Only USD positions are supported',
        400,
        'UNSUPPORTED_CURRENCY',
      );
    }
    await this.ratesService.backfill(input.baseDate);
    return this.repository.create(input);
  }

  createEvent(
    positionId: number,
    input: CreateBalanceEventInput,
  ): BalanceEvent {
    const position = this.repository.findById(positionId);
    if (position === undefined) {
      throw new AppError('Position not found', 404, 'POSITION_NOT_FOUND');
    }

    const events = this.repository.listEvents(positionId);
    let balanceCents = 0;
    const eventsWithNew = [
      ...events,
      {
        id: Number.MAX_SAFE_INTEGER,
        date: input.date,
        deltaCents: input.deltaCents,
      },
    ].sort((left, right) =>
      left.date < right.date
        ? -1
        : left.date > right.date
          ? 1
          : left.id - right.id,
    );

    for (const event of eventsWithNew) {
      balanceCents += event.deltaCents;
      if (balanceCents < 0) {
        throw new AppError(
          'Balance events cannot make the USD balance negative',
          400,
          'INSUFFICIENT_BALANCE',
        );
      }
    }

    return this.repository.createEvent(positionId, input);
  }
}
