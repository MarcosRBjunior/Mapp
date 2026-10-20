import type pg from 'pg';

// Leaves the database as db:migrate + db:seed left it, for the other test files.
export async function resetSyncState(client: pg.Client): Promise<void> {
  await client.query('DELETE FROM sync_checkpoint');
  await client.query('DELETE FROM provider_call');
  await client.query('DELETE FROM sync_run');
  await client.query('DELETE FROM daily_stat');
  await client.query("DELETE FROM country_alias WHERE status = 'pending'");
  await client.query('REFRESH MATERIALIZED VIEW global_daily_stat');
}
