import pg from 'pg';
import { loadDbEnv } from '../src/config/db-env.js';
import { createLogger } from '../src/lib/logger.js';
import { assertSeparateRoles, buildReaderRoleSql, parseConnectionUrl } from './roles-sql.js';

const env = loadDbEnv();
const logger = createLogger('info');
const reader = parseConnectionUrl(env.DATABASE_URL);
const owner = parseConnectionUrl(env.DATABASE_URL_SYNC);
assertSeparateRoles(reader, owner);

const client = new pg.Client({ connectionString: env.DATABASE_URL_SYNC });
await client.connect();
try {
  const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [reader.user]);
  const statements = buildReaderRoleSql({
    owner: owner.user,
    reader: reader.user,
    password: reader.password,
    database: reader.database,
    readerExists: existing.rowCount === 1,
  });
  await client.query('BEGIN');
  for (const statement of statements) {
    await client.query(statement);
  }
  await client.query('COMMIT');
  logger.info({ role: reader.user, database: reader.database }, 'reader role ready');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
