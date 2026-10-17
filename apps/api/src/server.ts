import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { AppConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { AppError } from './lib/app-error.js';
import { getTodayInTimezone } from './lib/dates.js';
import { NbuRateProvider } from './modules/rates/nbu.client.js';
import { MonobankRateProvider } from './modules/rates/monobank.client.js';
import { RatesRepository } from './modules/rates/rates.repository.js';
import { RatesService } from './modules/rates/rates.service.js';
import type { RateProvider } from './modules/rates/rate-provider.js';
import { startRatesJob } from './modules/rates/rates.job.js';
import { registerHealthRoutes } from './modules/health/routes.js';
import { registerPositionRoutes } from './modules/positions/routes.js';
import { PositionsRepository } from './modules/positions/positions.repository.js';
import { registerRatesRoutes } from './modules/rates/routes.js';
import { registerAnalyticsRoutes } from './modules/analytics/routes.js';
import { DataRepository } from './modules/data/data.repository.js';
import { registerDataRoutes } from './modules/data/routes.js';

function getStatusCode(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode;
  }
  return undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}

export function createServer(
  config: AppConfig,
  options: {
    logger?: boolean;
    enableRatesJobs?: boolean;
    rateProvider?: RateProvider;
    monobankRateProvider?: RateProvider;
    getToday?: () => string;
    now?: () => Date;
  } = {},
) {
  const database = createDatabase(config);
  const app = Fastify({
    logger: options.logger ?? { level: 'info' },
  });
  let ratesJob: ReturnType<typeof startRatesJob> | undefined;

  app.decorate('db', database.db);
  app.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.url === '/health') {
      return;
    }

    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;
    const suppliedToken = token === undefined ? undefined : Buffer.from(token);
    const expectedToken = Buffer.from(config.API_TOKEN);
    if (
      suppliedToken === undefined ||
      suppliedToken.length !== expectedToken.length ||
      !timingSafeEqual(suppliedToken, expectedToken)
    ) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authorization header is missing or invalid',
        },
      });
    }
  });

  app.addHook('onClose', async () => {
    ratesJob?.stop();
    database.sqlite.close();
  });

  const ratesRepository = new RatesRepository(database.db);
  const positionsRepository = new PositionsRepository(database.db);
  const dataRepository = new DataRepository(database.db);
  const ratesService = new RatesService(
    ratesRepository,
    options.rateProvider ?? new NbuRateProvider(),
    options.getToday ?? (() => getTodayInTimezone(config.TZ)),
  );
  const monobankRatesService = new RatesService(
    ratesRepository,
    options.monobankRateProvider ?? new MonobankRateProvider(),
    options.getToday ?? (() => getTodayInTimezone(config.TZ)),
    options.now,
  );

  if (options.enableRatesJobs ?? true) {
    app.addHook('onReady', async () => {
      const [nbuResult, monobankResult] = await Promise.allSettled([
        ratesService.catchUp(),
        monobankRatesService.updateToday(),
      ]);
      if (nbuResult.status === 'fulfilled') {
        app.log.info(
          { result: nbuResult.value },
          'NBU startup catch-up completed',
        );
      } else {
        app.log.error({ err: nbuResult.reason }, 'NBU startup catch-up failed');
      }
      if (monobankResult.status === 'fulfilled') {
        app.log.info(
          { result: monobankResult.value },
          'Monobank startup rate update completed',
        );
      } else {
        app.log.error(
          { err: monobankResult.reason },
          'Monobank startup rate update failed',
        );
      }

      ratesJob = startRatesJob(monobankRatesService, app.log, config.TZ);
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn({ err: error }, 'Request failed');
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'validation' in error &&
      error.validation
    ) {
      request.log.warn({ err: error }, 'Request validation failed');
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
        },
      });
    }

    const errorStatusCode = getStatusCode(error);
    const statusCode =
      errorStatusCode !== undefined &&
      errorStatusCode >= 400 &&
      errorStatusCode < 500
        ? errorStatusCode
        : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled request error');
    } else {
      request.log.warn({ err: error }, 'Client request error');
    }

    return reply.status(statusCode).send({
      error: {
        code: statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message:
          statusCode < 500
            ? getErrorMessage(error)
            : 'An unexpected error occurred',
      },
    });
  });

  registerHealthRoutes(app);
  registerPositionRoutes(app, positionsRepository, ratesService);
  registerRatesRoutes(app, ratesRepository, monobankRatesService);
  registerAnalyticsRoutes(app, positionsRepository, ratesRepository);
  registerDataRoutes(app, dataRepository);

  return app;
}
