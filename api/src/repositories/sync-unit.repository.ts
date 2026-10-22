import type { Metric, PrismaClient } from '../generated/prisma/client.js';
import type { SeriesPoint } from '../providers/covid-provider.js';
import { insertPendingAliases } from './alias.repository.js';
import { upsertDailyStats, upsertSeries, type DailyStatValues } from './daily-stat.repository.js';
import { completeCheckpoint } from './sync-run.repository.js';

export type UnitRows =
  | { kind: 'day'; metric: Metric; statDate: string; values: readonly DailyStatValues[] }
  | {
      kind: 'series';
      metric: Metric;
      series: readonly { countryCode: string; points: readonly SeriesPoint[] }[];
    };

export interface UnitWrite {
  sourceId: number;
  runId: number;
  unit: string;
  pendingNames: readonly string[];
  rows: UnitRows;
}

// A unit is all or nothing: pending aliases, its rows and the done checkpoint.
export async function writeUnit(prisma: PrismaClient, input: UnitWrite): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await insertPendingAliases(tx, input.sourceId, input.pendingNames);
    let written = 0;
    if (input.rows.kind === 'day') {
      written = await upsertDailyStats(tx, {
        sourceId: input.sourceId,
        metric: input.rows.metric,
        statDate: input.rows.statDate,
        values: input.rows.values,
      });
    } else {
      for (const entry of input.rows.series) {
        written += await upsertSeries(tx, {
          sourceId: input.sourceId,
          metric: input.rows.metric,
          countryCode: entry.countryCode,
          points: entry.points,
        });
      }
    }
    await completeCheckpoint(tx, input.runId, input.unit);
    return written;
  });
}
