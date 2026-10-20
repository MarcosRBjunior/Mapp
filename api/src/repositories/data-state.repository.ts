import { toIsoDate } from '../lib/dates.js';
import type { Db } from '../lib/prisma.js';

export interface SourceRecord {
  id: number;
  code: string;
  name: string;
  url: string;
  license: string;
  attribution: string;
}

export interface Coverage {
  from: string | null;
  referenceDate: string | null;
  countries: number;
}

export interface DataStateRepository {
  findSource(code: string): Promise<SourceRecord | null>;
  findDataVersion(sourceId: number): Promise<number | null>;
  findCoverage(sourceId: number): Promise<Coverage>;
  hasGlobalDate(sourceId: number, date: string): Promise<boolean>;
}

interface CoverageRow {
  from: Date | null;
  referenceDate: Date | null;
  countries: number;
}

export function createDataStateRepository(db: Db): DataStateRepository {
  return {
    findSource: (code) =>
      db.dataSource.findUnique({
        where: { code },
        select: { id: true, code: true, name: true, url: true, license: true, attribution: true },
      }),

    async findDataVersion(sourceId) {
      const run = await db.syncRun.findFirst({
        where: { sourceId, status: { in: ['success', 'partial'] } },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      return run?.id ?? null;
    },

    // RN-06: last date where both metrics have every country the source has ever sent.
    async findCoverage(sourceId) {
      const [row] = await db.$queryRaw<CoverageRow[]>`
        WITH present AS (
          SELECT count(DISTINCT country_code)::int AS n FROM daily_stat WHERE source_id = ${sourceId}
        )
        SELECT
          (SELECT min(stat_date) FROM global_daily_stat WHERE source_id = ${sourceId}) AS "from",
          (SELECT max(complete.stat_date) FROM (
             SELECT stat_date FROM global_daily_stat WHERE source_id = ${sourceId}
             GROUP BY stat_date
             HAVING count(*) = 2 AND min(country_count) = (SELECT n FROM present)
           ) complete) AS "referenceDate",
          (SELECT n FROM present) AS countries`;
      return {
        from: row?.from ? toIsoDate(row.from) : null,
        referenceDate: row?.referenceDate ? toIsoDate(row.referenceDate) : null,
        countries: row?.countries ?? 0,
      };
    },

    async hasGlobalDate(sourceId, date) {
      const [row] = await db.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM global_daily_stat
        WHERE source_id = ${sourceId} AND stat_date = ${date}::date`;
      return row?.n === 2;
    },
  };
}
