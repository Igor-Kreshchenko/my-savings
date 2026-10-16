import Fastify from 'fastify';
import type { AppConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { AppError } from './lib/app-error.js';
import { getTodayInTimezone } from './lib/dates.js';
import { NbuRateProvider } from './modules/rates/nbu.client.js';
import { RatesRepository } from './modules/rates/rates.repository.js';
import { RatesService } from './modules/rates/rates.service.js';
import { startRatesJob } from './modules/rates/rates.job.js';
import { registerHealthRoutes } from './modules/health/routes.js';

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
  options: { logger?: boolean; enableRatesJobs?: boolean } = {},
) {
  const database = createDatabase(config);
  const app = Fastify({
    logger: options.logger ?? { level: 'info' },
  });
  let ratesJob: ReturnType<typeof startRatesJob> | undefined;

  app.decorate('db', database.db);
  app.addHook('onClose', async () => {
    ratesJob?.stop();
    database.sqlite.close();
  });

  if (options.enableRatesJobs ?? true) {
    app.addHook('onReady', async () => {
      const ratesService = new RatesService(
        new RatesRepository(database.db),
        new NbuRateProvider(),
        () => getTodayInTimezone(config.TZ),
      );

      try {
        const result = await ratesService.catchUp();
        app.log.info({ result }, 'Startup rate catch-up completed');
      } catch (error) {
        app.log.error({ err: error }, 'Startup rate catch-up failed');
      }

      ratesJob = startRatesJob(ratesService, app.log, config.TZ);
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

  return app;
}
