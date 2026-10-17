import { balanceEvents, positions, rates } from '../../db/schema.js';
import type { createDatabase } from '../../db/client.js';

type DataDatabase = ReturnType<typeof createDatabase>['db'];

export class DataRepository {
  constructor(private readonly db: DataDatabase) {}

  clearAll(): void {
    this.db.transaction((transaction) => {
      transaction.delete(balanceEvents).run();
      transaction.delete(positions).run();
      transaction.delete(rates).run();
    });
  }
}
