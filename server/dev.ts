/**
 * Development bootstrap: starts the Express API and mounts Vite in middleware
 * mode so the UI and the API share one origin (and one port) with HMR.
 *
 * Run it with `pnpm dev` (tsx) or `node dist/dev.cjs`.
 */
import process from 'node:process';
import 'dotenv/config';

import { config, isServerKeyConfigured } from './config.js';
import { logger } from './logger.js';
import { createApp } from './app.js';

async function main(): Promise<void> {
  const app = await createApp({ withVite: true });
  const server = app.listen(config.port, config.host, () => {
    logger.info('وضع التطوير جاهز (Express + Vite HMR)', {
      url: `http://localhost:${config.port}`,
      models: config.models,
      serverKeyConfigured: isServerKeyConfigured(),
    });
  });

  // Voice batches can be large and slow: never cut a request short.
  server.headersTimeout = 0;
  server.requestTimeout = 0;
  server.keepAliveTimeout = 75_000;

  const shutdown = (signal: string): void => {
    logger.info('إيقاف الخادم', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.error('فشل تشغيل خادم التطوير', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
