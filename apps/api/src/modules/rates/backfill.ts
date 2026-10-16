import { dateSchema } from '@my-savings/shared';
import { loadConfig } from '../../config.js';
import { createDatabase } from '../../db/client.js';
import { getTodayInTimezone } from '../../lib/dates.js';
import { NbuRateProvider } from './nbu.client.js';
import { RatesRepository } from './rates.repository.js';
import { RatesService } from './rates.service.js';

function getFromDate(args: string[]): string {
  if (args.length !== 2 || args[0] !== '--from' || args[1] === undefined) {
    throw new Error(
      'Usage: pnpm --filter @my-savings/api rates:backfill --from YYYY-MM-DD',
    );
  }
  return dateSchema.parse(args[1]);
}

async function main(): Promise<void> {
  const from = getFromDate(process.argv.slice(2));
  const config = loadConfig();
  const database = createDatabase(config);

  try {
    const service = new RatesService(
      new RatesRepository(database.db),
      new NbuRateProvider(),
      () => getTodayInTimezone(config.TZ),
    );
    const result = await service.backfill(from);
    console.info(`Rate backfill completed: ${JSON.stringify(result)}`);
  } finally {
    database.sqlite.close();
  }
}

main().catch((error: unknown) => {
  console.error('Rate backfill failed', error);
  process.exitCode = 1;
});
