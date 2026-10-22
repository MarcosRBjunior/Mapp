import { z } from 'zod';
import { isIsoDate } from '../../lib/dates.js';
import type { Metric, SeriesPoint, SeriesRow, SourceRow } from '../covid-provider.js';

const values = z.object({ total: z.int().min(0), new: z.int() });
const location = { country: z.string().min(1), region: z.string() };

export const daySchemas: Record<Metric, z.ZodType<SourceRow[]>> = {
  cases: z
    .array(
      z
        .object({ ...location, cases: values })
        .transform(({ country, region, cases }) => ({ country, region, ...cases })),
    )
    .min(1),
  deaths: z
    .array(
      z
        .object({ ...location, deaths: values })
        .transform(({ country, region, deaths }) => ({ country, region, ...deaths })),
    )
    .min(1),
};

const dateKey = z.string().refine(isIsoDate, { error: 'must be a YYYY-MM-DD date' });
const seriesValues = z.record(dateKey, values);

function toPoints(record: Record<string, { total: number; new: number }>): SeriesPoint[] {
  return Object.entries(record)
    .map(([date, point]) => ({ date, total: point.total, new: point.new }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const seriesSchemas: Record<Metric, z.ZodType<SeriesRow[]>> = {
  cases: z
    .array(
      z
        .object({ ...location, cases: seriesValues })
        .transform(({ country, region, cases }) => ({ country, region, points: toPoints(cases) })),
    )
    .min(1),
  deaths: z
    .array(
      z.object({ ...location, deaths: seriesValues }).transform(({ country, region, deaths }) => ({
        country,
        region,
        points: toPoints(deaths),
      })),
    )
    .min(1),
};
