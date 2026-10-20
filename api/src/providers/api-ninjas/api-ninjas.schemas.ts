import { z } from 'zod';
import type { Metric, SourceRow } from '../covid-provider.js';

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
