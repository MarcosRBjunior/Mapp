import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';

function main(): void {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);

  createApp().listen(env.PORT, (error) => {
    if (error) {
      logger.fatal({ err: error }, 'failed to start api');
      process.exit(1);
    }
    logger.info({ port: env.PORT }, 'api listening');
  });
}

try {
  main();
} catch (error) {
  createLogger('info').fatal({ err: error }, 'failed to start api');
  process.exit(1);
}
