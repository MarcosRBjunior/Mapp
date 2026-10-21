import { METRICS, type ProviderFactory } from '../../providers/covid-provider.js';
import { aggregateDay } from './aggregate.js';
import type { RunPlan, UnitPlan } from './run-units.js';

// The reference date only: one unit per metric for the source's final date.
export function snapshotPlan(source: ProviderFactory): RunPlan {
  const date = source.finalDate;
  const units: UnitPlan[] = METRICS.map((metric) => ({
    unit: `snapshot:${metric}:${date}`,
    async load({ provider, aliases }) {
      const day = aggregateDay(await provider.fetchDay(date, metric), aliases);
      return {
        rows: { kind: 'day', metric, statDate: date, values: day.stats },
        pendingNames: day.pendingNames,
        ignoredNames: day.ignoredNames,
      };
    },
  }));
  return {
    mode: 'snapshot',
    referenceDate: date,
    planUnits: () => Promise.resolve({ units, alreadyDone: 0 }),
  };
}
