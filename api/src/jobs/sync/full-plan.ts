import {
  METRICS,
  type CovidProvider,
  type Metric,
  type ProviderFactory,
} from '../../providers/covid-provider.js';
import { ProviderPayloadError } from '../../providers/provider-errors.js';
import { findDoneUnits } from '../../repositories/sync-run.repository.js';
import { aggregateSeries, type AliasEntry } from './aggregate.js';
import type { RunPlan, UnitOutput, UnitPlan } from './run-units.js';

export interface FullUnit {
  unit: string;
  metric: Metric;
  sourceName: string;
}

export class DuplicateAliasError extends Error {
  constructor(duplicates: string[]) {
    super(
      `Mapped aliases share a country (each series would overwrite the other): ${duplicates.join('; ')}`,
    );
    this.name = 'DuplicateAliasError';
  }
}

// One unit per (metric, mapped source name); the historical series never changes, so done units are skipped.
export function planFullUnits(
  aliases: ReadonlyMap<string, AliasEntry>,
  done: ReadonlySet<string>,
): { units: FullUnit[]; planned: number } {
  const namesByCode = new Map<string, string[]>();
  for (const [name, alias] of aliases) {
    if (alias.status === 'mapped' && alias.countryCode !== null) {
      namesByCode.set(alias.countryCode, [...(namesByCode.get(alias.countryCode) ?? []), name]);
    }
  }
  const duplicates = [...namesByCode.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([code, names]) => `${code}: ${[...names].sort().join(', ')}`)
    .sort();
  if (duplicates.length > 0) {
    throw new DuplicateAliasError(duplicates);
  }

  const names = [...namesByCode.values()].flat().sort((a, b) => a.localeCompare(b, 'en'));
  const all = METRICS.flatMap((metric) =>
    names.map((sourceName) => ({ unit: `full:${metric}:${sourceName}`, metric, sourceName })),
  );
  return { units: all.filter((unit) => !done.has(unit.unit)), planned: all.length };
}

// The source may match ?country= by prefix (Niger/Nigeria): keep only the requested name.
export async function loadFullUnit(
  provider: CovidProvider,
  aliases: ReadonlyMap<string, AliasEntry>,
  unit: FullUnit,
): Promise<UnitOutput> {
  const rows = (await provider.fetchSeries(unit.sourceName, unit.metric)).filter(
    (row) => row.country === unit.sourceName,
  );
  if (rows.length === 0) {
    throw new ProviderPayloadError(`series for ${unit.sourceName} has no rows for that name`);
  }
  const result = aggregateSeries(rows, aliases);
  if (result.series.length > 1) {
    throw new ProviderPayloadError(
      `series for ${unit.sourceName} maps to several countries: ${result.series
        .map((entry) => entry.countryCode)
        .join(', ')}`,
    );
  }
  return {
    rows: { kind: 'series', metric: unit.metric, series: result.series },
    pendingNames: result.pendingNames,
    ignoredNames: result.ignoredNames,
  };
}

export function fullPlan(source: ProviderFactory): RunPlan {
  return {
    mode: 'full',
    referenceDate: source.finalDate,
    async planUnits({ prisma, sourceId, aliases }) {
      const { units, planned } = planFullUnits(
        aliases,
        await findDoneUnits(prisma, sourceId, 'full'),
      );
      return {
        alreadyDone: planned - units.length,
        units: units.map((unit): UnitPlan => ({
          unit: unit.unit,
          load: ({ provider, aliases: known }) => loadFullUnit(provider, known, unit),
        })),
      };
    },
  };
}
