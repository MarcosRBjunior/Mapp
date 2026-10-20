import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createPrisma } from './lib/prisma.js';
import { createReadRepositories } from './repositories/read-repositories.js';
import { createServices } from './services/create-services.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function main(): void {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const prisma = createPrisma(env.DATABASE_URL);
  const services = createServices(createReadRepositories(prisma), env.DATA_PROVIDER);

  const server = createApp({ services, logger, webOrigin: env.WEB_ORIGIN }).listen(env.PORT);

  server.on('listening', () => {
    logger.info({ port: env.PORT }, 'api listening');
  });
  server.on('error', (error) => {
    logger.fatal({ err: error }, 'api server error');
    process.exit(1);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'shutting down');
    setTimeout(() => {
      logger.error('shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    server.close(() => {
      void prisma
        .$disconnect()
        .catch((error: unknown) => {
          logger.error({ err: error }, 'failed to disconnect from the database');
        })
        .finally(() => process.exit(0));
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

try {
  main();
} catch (error) {
  createLogger('info').fatal({ err: error }, 'failed to start api');
  process.exit(1);
}
