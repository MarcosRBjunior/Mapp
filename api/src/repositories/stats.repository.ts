import { Prisma } from '../generated/prisma/client.js';
import type { Db } from '../lib/prisma.js';

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
             PARTITION BY s.metric ORDER BY s.total DESC, c.name COLLATE "pt-BR-x-icu"
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
        ORDER BY c.name COLLATE "pt-BR-x-icu"`,

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
  };
}
