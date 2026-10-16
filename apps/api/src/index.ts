import { ZodError } from 'zod';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

async function start(): Promise<void> {
  const config = loadConfig();
  const app = createServer(config);

  try {
    await app.listen({ host: '0.0.0.0', port: config.PORT });
  } catch (error) {
    app.log.error({ err: error }, 'Failed to start API server');
    await app.close();
    process.exitCode = 1;
  }
}

try {
  await start();
} catch (error) {
  if (error instanceof ZodError) {
    console.error(
      'Invalid API configuration:',
      error.issues.map(({ path, message }) => ({
        variable: path.join('.'),
        message,
      })),
    );
  } else {
    console.error('Failed to start API server', error);
  }
  process.exitCode = 1;
}
