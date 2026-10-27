import { toIsoDate } from '../lib/dates.js';
import type { Db } from '../lib/prisma.js';
import { completeDatesSql } from './complete-dates.js';

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
  findIncompleteDates(sourceId: number): Promise<string[]>;
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

    // RN-06 from the view only: coverage runs from the first to the last complete date.
    // Rows not yet refreshed are ignored.
    async findCoverage(sourceId) {
      const [row] = await db.$queryRaw<CoverageRow[]>`
        WITH complete AS (${completeDatesSql(sourceId)})
        SELECT
          (SELECT min(stat_date) FROM complete) AS "from",
          (SELECT max(stat_date) FROM complete) AS "referenceDate",
          coalesce(
            (SELECT max(country_count) FROM global_daily_stat WHERE source_id = ${sourceId}),
            0
          )::int AS countries`;
      return {
        from: row?.from ? toIsoDate(row.from) : null,
        referenceDate: row?.referenceDate ? toIsoDate(row.referenceDate) : null,
        countries: row?.countries ?? 0,
      };
    },

    // RN-06: every calendar date between the first and last complete date that is not complete,
    // including dates the view has no row for.
    async findIncompleteDates(sourceId) {
      const rows = await db.$queryRaw<{ statDate: Date }[]>`
        WITH complete AS (${completeDatesSql(sourceId)}),
        bounds AS (SELECT min(stat_date) AS first, max(stat_date) AS last FROM complete)
        SELECT d::date AS "statDate"
        FROM bounds, generate_series(bounds.first, bounds.last, interval '1 day') AS d
        WHERE d::date NOT IN (SELECT stat_date FROM complete)
        ORDER BY 1`;
      return rows.map((row) => toIsoDate(row.statDate));
    },
  };
}
