import Fastify from 'fastify';
import type { AppConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { AppError } from './lib/app-error.js';
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
  options: { logger?: boolean } = {},
) {
  const database = createDatabase(config);
  const app = Fastify({
    logger: options.logger ?? { level: 'info' },
  });

  app.decorate('db', database.db);
  app.addHook('onClose', async () => {
    database.sqlite.close();
  });

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
