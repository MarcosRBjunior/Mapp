import type { Metric } from '../generated/prisma/client.js';
import type { Db } from '../lib/prisma.js';
import type { SeriesPoint } from '../providers/covid-provider.js';

export interface DailyStatValues {
  countryCode: string;
  total: number;
  new: number;
}

export interface DailyStatBatch {
  sourceId: number;
  metric: Metric;
  statDate: string;
  values: readonly DailyStatValues[];
}

// RN-09: idempotent upsert by (country, metric, date, source); updated_at is set by SQL.
export async function upsertDailyStats(db: Db, batch: DailyStatBatch): Promise<number> {
  if (batch.values.length === 0) {
    return 0;
  }
  const codes = batch.values.map((value) => value.countryCode);
  const totals = batch.values.map((value) => value.total);
  const news = batch.values.map((value) => value.new);
  return db.$executeRaw`
    INSERT INTO daily_stat (country_code, metric, stat_date, source_id, total, new_value, updated_at)
    SELECT v.code, ${batch.metric}::metric, ${batch.statDate}::date, ${batch.sourceId},
           v.total, v.new_value, now()
    FROM unnest(${codes}::text[], ${totals}::int[], ${news}::int[]) AS v(code, total, new_value)
    ON CONFLICT (country_code, metric, stat_date, source_id)
    DO UPDATE SET total = EXCLUDED.total, new_value = EXCLUDED.new_value, updated_at = now()`;
}

export interface SeriesBatch {
  sourceId: number;
  metric: Metric;
  countryCode: string;
  points: readonly SeriesPoint[];
}

// RN-09 for a whole country series in one statement.
export async function upsertSeries(db: Db, batch: SeriesBatch): Promise<number> {
  if (batch.points.length === 0) {
    return 0;
  }
  const dates = batch.points.map((point) => point.date);
  const totals = batch.points.map((point) => point.total);
  const news = batch.points.map((point) => point.new);
  return db.$executeRaw`
    INSERT INTO daily_stat (country_code, metric, stat_date, source_id, total, new_value, updated_at)
    SELECT ${batch.countryCode}, ${batch.metric}::metric, v.stat_date, ${batch.sourceId},
           v.total, v.new_value, now()
    FROM unnest(${dates}::date[], ${totals}::int[], ${news}::int[]) AS v(stat_date, total, new_value)
    ON CONFLICT (country_code, metric, stat_date, source_id)
    DO UPDATE SET total = EXCLUDED.total, new_value = EXCLUDED.new_value, updated_at = now()`;
}
