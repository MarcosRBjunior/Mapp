import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';

function main(): void {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);

  const server = createApp().listen(env.PORT);

  server.on('listening', () => {
    logger.info({ port: env.PORT }, 'api listening');
  });
  server.on('error', (error) => {
    logger.fatal({ err: error }, 'api server error');
    process.exit(1);
  });
}

try {
  main();
} catch (error) {
  createLogger('info').fatal({ err: error }, 'failed to start api');
  process.exit(1);
}
