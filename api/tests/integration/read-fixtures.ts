import type pg from 'pg';
import { resetSyncState } from './sync-state.js';

export const D1 = '2023-03-08';
export const D2 = '2023-03-09';

const STATS: ReadonlyArray<readonly [string, 'cases' | 'deaths', string, number, number]> = [
  ['BRA', 'cases', D1, 100, 10],
  ['ARG', 'cases', D1, 100, 5],
  ['XDP', 'cases', D1, 50, 0],
  ['BRA', 'deaths', D1, 10, 1],
  ['ARG', 'deaths', D1, 20, 2],
  ['XDP', 'deaths', D1, 5, 0],
  ['BRA', 'cases', D2, 110, 10],
  ['XDP', 'cases', D2, 50, 0],
  ['BRA', 'deaths', D2, 11, 1],
  ['XDP', 'deaths', D2, 5, 0],
];

export interface ReadFixture {
  sourceId: number;
  successId: number;
  partialId: number;
  failedId: number;
}

async function insertRun(
  owner: pg.Client,
  sourceId: number,
  status: string,
  day: string,
): Promise<number> {
  const result = await owner.query<{ id: number }>(
    `INSERT INTO sync_run (source_id, mode, status, started_at, finished_at)
     VALUES ($1, 'snapshot', $2, $3, $4) RETURNING id`,
    [sourceId, status, `${day}T00:00:00Z`, `${day}T00:01:00Z`],
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error('sync_run insert returned no id');
  return id;
}

export async function seedReadFixture(owner: pg.Client): Promise<ReadFixture> {
  await resetSyncState(owner);
  const source = await owner.query<{ id: number }>(
    "SELECT id FROM data_source WHERE code = 'api_ninjas'",
  );
  const sourceId = source.rows[0]?.id;
  if (sourceId === undefined) throw new Error('api_ninjas source is not seeded');

  for (const [code, metric, date, total, newValue] of STATS) {
    await owner.query(
      `INSERT INTO daily_stat (country_code, metric, stat_date, source_id, total, new_value)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [code, metric, date, sourceId, total, newValue],
    );
  }
  await owner.query('REFRESH MATERIALIZED VIEW global_daily_stat');

  return {
    sourceId,
    successId: await insertRun(owner, sourceId, 'success', '2026-10-01'),
    partialId: await insertRun(owner, sourceId, 'partial', '2026-10-02'),
    failedId: await insertRun(owner, sourceId, 'failed', '2026-10-03'),
  };
}
