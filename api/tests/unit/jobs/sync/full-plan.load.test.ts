import { describe, expect, it } from 'vitest';
import type { AliasEntry } from '../../../../src/jobs/sync/aggregate.js';
import { loadFullUnit } from '../../../../src/jobs/sync/full-plan.js';
import type { CovidProvider, SeriesRow } from '../../../../src/providers/covid-provider.js';
import { ProviderPayloadError } from '../../../../src/providers/provider-errors.js';

const aliases = new Map<string, AliasEntry>([
  ['Niger', { status: 'mapped', countryCode: 'NER' }],
  ['Nigeria', { status: 'mapped', countryCode: 'NGA' }],
]);

function row(country: string): SeriesRow {
  return { country, region: '', points: [{ date: '2023-03-09', total: 5, new: 1 }] };
}

function providerReturning(rows: SeriesRow[]): CovidProvider {
  return {
    fetchDay: () => Promise.reject(new Error('not used')),
    fetchSeries: () => Promise.resolve(rows),
  };
}

const unit = { unit: 'full:cases:Niger', metric: 'cases', sourceName: 'Niger' } as const;

describe('loadFullUnit', () => {
  it('keeps only the requested country when the source matches by prefix', async () => {
    const output = await loadFullUnit(
      providerReturning([row('Niger'), row('Nigeria')]),
      aliases,
      unit,
    );

    expect(output.rows).toMatchObject({ kind: 'series', series: [{ countryCode: 'NER' }] });
    expect(output.pendingNames).toEqual([]);
  });

  it('rejects a response without rows for the requested name', async () => {
    await expect(loadFullUnit(providerReturning([row('Nigeria')]), aliases, unit)).rejects.toThrow(
      ProviderPayloadError,
    );
  });
});
