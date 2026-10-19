import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { TEST_DATABASE, loadTestDbUrls, scriptEnv } from './test-db.js';

export default async function setup(): Promise<void> {
  const urls = loadTestDbUrls();
  const admin = new pg.Client({ connectionString: urls.adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
  } finally {
    await admin.end();
  }

  const env = scriptEnv(urls);
  execFileSync('npm', ['run', 'db:migrate'], { env, stdio: 'pipe' });
  execFileSync('npm', ['run', 'db:seed'], { env, stdio: 'pipe' });
}
