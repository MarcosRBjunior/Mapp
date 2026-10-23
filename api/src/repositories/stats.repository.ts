import { Prisma } from '../generated/prisma/client.js';
import { toIsoDate } from '../lib/dates.js';
import type { Db } from '../lib/prisma.js';
import { completeDatesSql } from './complete-dates.js';

export type StatMetric = 'cases' | 'deaths';

export interface GlobalDayRow {
  metric: StatMetric;
  total: number;
  newValue: number;
  countryCount: number;
}

export interface CountryRecord {
  code: string;
  name: string;
  kind: 'country' | 'non_geographic';
  lat: number | null;
  lng: number | null;
  population: number | null;
}

export interface CountryDayValue {
  code: string;
  name: string;
  lat: number | null;
  lng: number | null;
  total: number | null;
  newValue: number | null;
}

export interface RankingRow {
  rank: number;
  code: string;
  name: string;
  total: number;
  newValue: number;
  rankedCount: number;
}

export interface CountryRankRow {
  metric: StatMetric;
  total: number | null;
  newValue: number | null;
  rank: number | null;
  rankedCount: number;
}

export type Granularity = 'day' | 'week' | 'month';

export interface SeriesRange {
  from: string;
  to: string;
  granularity: Granularity;
}

export interface SeriesPointRow {
  date: string;
  total: number;
  newValue: number;
}

export interface StatsRepository {
  findGlobalDay(sourceId: number, date: string): Promise<GlobalDayRow[]>;
  listCountryValues(sourceId: number, metric: StatMetric, date: string): Promise<CountryDayValue[]>;
  findCountry(code: string): Promise<CountryRecord | null>;
  listRanking(
    sourceId: number,
    metric: StatMetric,
    date: string,
    limit: number,
  ): Promise<RankingRow[]>;
  findCountryRanks(sourceId: number, date: string, code: string): Promise<CountryRankRow[]>;
  listGlobalSeries(
    sourceId: number,
    metric: StatMetric,
    range: SeriesRange,
  ): Promise<SeriesPointRow[]>;
  listCountrySeries(
    sourceId: number,
    code: string,
    metric: StatMetric,
    range: SeriesRange,
  ): Promise<SeriesPointRow[]>;
}

interface RawSeriesPoint {
  date: Date;
  total: bigint;
  newValue: bigint;
}

// RN-11: a week (ISO, from Monday) or month sums `new` and keeps the last `total`; the first
// bucket starts at `from`. `days` must yield stat_date, total and new_value.
function bucketSql(days: Prisma.Sql, range: SeriesRange): Prisma.Sql {
  return Prisma.sql`
    SELECT greatest(
             date_trunc(${range.granularity}::text, d.stat_date::timestamp)::date,
             ${range.from}::date
           ) AS date,
           (array_agg(d.total ORDER BY d.stat_date DESC))[1]::bigint AS total,
           sum(d.new_value)::bigint AS "newValue"
    FROM (${days}) d
    GROUP BY 1
    ORDER BY 1`;
}

function toPoints(rows: RawSeriesPoint[]): SeriesPointRow[] {
  // Sums stay far below 2^53.
  return rows.map((row) => ({
    date: toIsoDate(row.date),
    total: Number(row.total),
    newValue: Number(row.newValue),
  }));
}

interface GlobalViewRow {
  metric: StatMetric;
  total: bigint;
  newValue: bigint;
  countryCount: number;
}

// RN-05: absolute value, ties in pt-BR alphabetical order; only kind = country (RN-08).
function rankedSql(sourceId: number, date: string): Prisma.Sql {
  return Prisma.sql`
    SELECT s.metric::text AS metric, s.country_code AS code, c.name, s.total,
           s.new_value AS "newValue",
           row_number() OVER (
             PARTITION BY s.metric ORDER BY s.total DESC, c.name COLLATE "pt-BR-x-icu", s.country_code
           )::int AS rank,
           count(*) OVER (PARTITION BY s.metric)::int AS "rankedCount"
    FROM daily_stat s
    JOIN country c ON c.code = s.country_code
    WHERE s.source_id = ${sourceId} AND s.stat_date = ${date}::date AND c.kind = 'country'`;
}

export function createStatsRepository(db: Db): StatsRepository {
  return {
    async findGlobalDay(sourceId, date) {
      const rows = await db.$queryRaw<GlobalViewRow[]>`
        SELECT metric::text AS metric, total, new_value AS "newValue", country_count AS "countryCount"
        FROM global_daily_stat
        WHERE source_id = ${sourceId} AND stat_date = ${date}::date
        ORDER BY metric`;
      // Global sums are bigint in the view; they stay far below 2^53.
      return rows.map((row) => ({
        metric: row.metric,
        total: Number(row.total),
        newValue: Number(row.newValue),
        countryCount: row.countryCount,
      }));
    },

    listCountryValues: (sourceId, metric, date) =>
      db.$queryRaw<CountryDayValue[]>`
        SELECT c.code, c.name, c.lat, c.lng, s.total, s.new_value AS "newValue"
        FROM country c
        LEFT JOIN daily_stat s
          ON s.country_code = c.code
         AND s.source_id = ${sourceId}
         AND s.metric = ${metric}::metric
         AND s.stat_date = ${date}::date
        WHERE c.kind = 'country'
        ORDER BY c.name COLLATE "pt-BR-x-icu", c.code`,

    async findCountry(code) {
      const country = await db.country.findUnique({ where: { code } });
      if (!country) return null;
      return {
        code: country.code,
        name: country.name,
        kind: country.kind,
        lat: country.lat,
        lng: country.lng,
        population: country.population === null ? null : Number(country.population),
      };
    },

    listRanking: (sourceId, metric, date, limit) =>
      db.$queryRaw<RankingRow[]>`
        SELECT rank, code, name, total, "newValue", "rankedCount"
        FROM (${rankedSql(sourceId, date)}) ranked
        WHERE metric = ${metric}
        ORDER BY rank
        LIMIT ${limit}`,

    findCountryRanks: (sourceId, date, code) =>
      db.$queryRaw<CountryRankRow[]>`
        WITH ranked AS (${rankedSql(sourceId, date)}),
        counts AS (
          SELECT metric, max("rankedCount") AS "rankedCount" FROM ranked GROUP BY metric
        )
        SELECT counts.metric, r.total, r."newValue", r.rank, counts."rankedCount"
        FROM counts
        LEFT JOIN ranked r ON r.metric = counts.metric AND r.code = ${code}
        ORDER BY counts.metric`,

    async listGlobalSeries(sourceId, metric, range) {
      const days = Prisma.sql`
        SELECT g.stat_date, g.total, g.new_value
        FROM global_daily_stat g
        JOIN (${completeDatesSql(sourceId)}) complete ON complete.stat_date = g.stat_date
        WHERE g.source_id = ${sourceId} AND g.metric = ${metric}::metric
          AND g.stat_date BETWEEN ${range.from}::date AND ${range.to}::date`;
      return toPoints(await db.$queryRaw<RawSeriesPoint[]>(bucketSql(days, range)));
    },

    async listCountrySeries(sourceId, code, metric, range) {
      const days = Prisma.sql`
        SELECT s.stat_date, s.total, s.new_value
        FROM daily_stat s
        JOIN (${completeDatesSql(sourceId)}) complete ON complete.stat_date = s.stat_date
        WHERE s.source_id = ${sourceId} AND s.country_code = ${code}
          AND s.metric = ${metric}::metric
          AND s.stat_date BETWEEN ${range.from}::date AND ${range.to}::date`;
      return toPoints(await db.$queryRaw<RawSeriesPoint[]>(bucketSql(days, range)));
    },
  };
}
