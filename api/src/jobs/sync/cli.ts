import { loadSyncEnv } from '../../config/sync-env.js';
import { createLogger } from '../../lib/logger.js';
import { createPrisma } from '../../lib/prisma.js';
import { createProvider } from '../../providers/create-provider.js';
import { UsageError, parseSyncArgs, type SyncMode } from './cli-args.js';
import { SyncLockedError, runSync } from './run-sync.js';

async function main(): Promise<number> {
  let mode: SyncMode;
  try {
    ({ mode } = parseSyncArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }

  const env = loadSyncEnv();
  const logger = createLogger(env.LOG_LEVEL);
  if (mode === 'full') {
    logger.error('mode=full is not available yet (phase F5)');
    return 2;
  }

  const prisma = createPrisma(env.DATABASE_URL_SYNC);
  try {
    const result = await runSync({
      prisma,
      lockUrl: env.DATABASE_URL_SYNC,
      createProvider: (fetch) => createProvider(env, fetch),
      fetch,
      limits: { perHour: env.SYNC_CALLS_PER_HOUR, perMonth: env.SYNC_CALLS_PER_MONTH },
      logger,
    });
    logger.info(result, 'sync finished');
    return result.status === 'failed' ? 1 : 0;
  } catch (error) {
    if (error instanceof SyncLockedError) {
      logger.error(error.message);
      return 1;
    }
    logger.fatal({ err: error }, 'sync crashed');
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'sync failed');
  process.exitCode = 1;
}
