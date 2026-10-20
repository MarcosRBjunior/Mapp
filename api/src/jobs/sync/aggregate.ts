import type { SourceRow } from '../../providers/covid-provider.js';

export type AliasStatus = 'mapped' | 'pending' | 'ignored';

export interface AliasEntry {
  status: AliasStatus;
  countryCode: string | null;
}

export interface CountryValues {
  countryCode: string;
  total: number;
  new: number;
}

export interface DayAggregate {
  stats: CountryValues[];
  pendingNames: string[];
  ignoredNames: string[];
}

// RN-02: every row of the same mapped country (regions, territories, ships) is summed.
export function aggregateDay(
  rows: readonly SourceRow[],
  aliases: ReadonlyMap<string, AliasEntry>,
): DayAggregate {
  const totals = new Map<string, CountryValues>();
  const pending = new Set<string>();
  const ignored = new Set<string>();

  for (const row of rows) {
    const alias = aliases.get(row.country);
    if (alias?.status === 'ignored') {
      ignored.add(row.country);
      continue;
    }
    if (alias?.status !== 'mapped' || alias.countryCode === null) {
      pending.add(row.country);
      continue;
    }
    const current = totals.get(alias.countryCode) ?? {
      countryCode: alias.countryCode,
      total: 0,
      new: 0,
    };
    current.total += row.total;
    current.new += row.new;
    totals.set(alias.countryCode, current);
  }

  return {
    stats: [...totals.values()].sort((a, b) => a.countryCode.localeCompare(b.countryCode)),
    pendingNames: [...pending].sort(),
    ignoredNames: [...ignored].sort(),
  };
}
