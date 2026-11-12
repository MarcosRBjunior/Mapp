import pg from 'pg';
import { postgresUrl } from '../src/config/db-env.js';
import { createLogger } from '../src/lib/logger.js';
import { evaluateDatabase, REQUIRED_COLLATION } from './db-check.js';

const logger = createLogger('info');
const url = postgresUrl.safeParse(process.env.DATABASE_URL_SYNC);
if (!url.success) {
  logger.fatal('DATABASE_URL_SYNC must be a postgres:// or postgresql:// URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url.data });
await client.connect();
try {
  const { rows } = await client.query<{ version_num: number; has_collation: boolean }>(
    `SELECT current_setting('server_version_num')::int AS version_num,
            EXISTS (SELECT 1 FROM pg_collation WHERE collname = $1) AS has_collation`,
    [REQUIRED_COLLATION],
  );
  const row = rows[0];
  if (!row) throw new Error('database check returned no row');
  const result = evaluateDatabase({
    versionNum: row.version_num,
    hasIcuCollation: row.has_collation,
  });
  for (const warning of result.warnings) logger.warn(warning);
  for (const error of result.errors) logger.error(error);
  if (result.errors.length > 0) process.exitCode = 1;
  else logger.info({ versionNum: row.version_num }, 'database check passed');
} finally {
  await client.end();
}
