/**
 * Production bootstrap: serves the pre-built client from `dist/client` and the
 * API from the same origin. Vite is never imported on this path.
 */
import process from 'node:process';
import 'dotenv/config';

import { config, isServerKeyConfigured } from './config.js';
import { logger } from './logger.js';
import { createApp } from './app.js';

async function main(): Promise<void> {
  const app = await createApp({ withVite: false });
  const server = app.listen(config.port, config.host, () => {
    logger.info('المترجم الصوتي والسياقي الذكي جاهز', {
      url: `http://localhost:${config.port}`,
      mode: 'production',
      models: config.models,
      serverKeyConfigured: isServerKeyConfigured(),
    });
  });

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
  logger.error('فشل تشغيل الخادم', { message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
