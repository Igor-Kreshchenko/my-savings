import type {
  BalanceEvent,
  CreateBalanceEventInput,
  CreatePositionInput,
  Position,
} from '@my-savings/shared';
import { asc, eq } from 'drizzle-orm';
import type { createDatabase } from '../../db/client.js';
import { balanceEvents, positions } from '../../db/schema.js';

type PositionsDatabase = ReturnType<typeof createDatabase>['db'];

export class PositionsRepository {
  constructor(private readonly db: PositionsDatabase) {}

  list(): Position[] {
    return this.db.select().from(positions).orderBy(asc(positions.id)).all();
  }

  findById(id: number): Position | undefined {
    return this.db.select().from(positions).where(eq(positions.id, id)).get();
  }

  create(input: CreatePositionInput): Position {
    const position = this.db.insert(positions).values(input).returning().get();
    if (position === undefined) {
      throw new Error('Failed to create position');
    }
    return position;
  }

  listEvents(positionId: number): BalanceEvent[] {
    return this.db
      .select()
      .from(balanceEvents)
      .where(eq(balanceEvents.positionId, positionId))
      .orderBy(asc(balanceEvents.date), asc(balanceEvents.id))
      .all();
  }

  createEvent(
    positionId: number,
    input: CreateBalanceEventInput,
  ): BalanceEvent {
    const event = this.db
      .insert(balanceEvents)
      .values({ ...input, positionId })
      .returning()
      .get();
    if (event === undefined) {
      throw new Error('Failed to create balance event');
    }
    return event;
  }
}
