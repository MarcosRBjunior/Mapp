import { describe, expect, it } from 'vitest';
import type { AliasEntry } from '../../../../src/jobs/sync/aggregate.js';
import { DuplicateAliasError, planFullUnits } from '../../../../src/jobs/sync/full-plan.js';

const aliases = new Map<string, AliasEntry>([
  ['Brazil', { status: 'mapped', countryCode: 'BRA' }],
  ['Afghanistan', { status: 'mapped', countryCode: 'AFG' }],
  ['Summer Olympics 2020', { status: 'ignored', countryCode: null }],
  ['Atlantis', { status: 'pending', countryCode: null }],
]);

describe('planFullUnits', () => {
  it('plans cases then deaths over the mapped names in alphabetical order', () => {
    expect(planFullUnits(aliases, new Set())).toEqual({
      planned: 4,
      units: [
        { unit: 'full:cases:Afghanistan', metric: 'cases', sourceName: 'Afghanistan' },
        { unit: 'full:cases:Brazil', metric: 'cases', sourceName: 'Brazil' },
        { unit: 'full:deaths:Afghanistan', metric: 'deaths', sourceName: 'Afghanistan' },
        { unit: 'full:deaths:Brazil', metric: 'deaths', sourceName: 'Brazil' },
      ],
    });
  });

  it('skips units already done', () => {
    const plan = planFullUnits(aliases, new Set(['full:cases:Brazil', 'full:other:unit']));
    expect(plan.planned).toBe(4);
    expect(plan.units.map((unit) => unit.unit)).toEqual([
      'full:cases:Afghanistan',
      'full:deaths:Afghanistan',
      'full:deaths:Brazil',
    ]);
  });

  it('refuses two mapped names for the same country', () => {
    const duplicated = new Map(aliases).set('Brasil', { status: 'mapped', countryCode: 'BRA' });
    expect(() => planFullUnits(duplicated, new Set())).toThrow(DuplicateAliasError);
    expect(() => planFullUnits(duplicated, new Set())).toThrow('BRA: Brasil, Brazil');
  });
});
