import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadAliasSeeds, parseAliasSeeds } from '../../../prisma/seed/aliases.js';
import type { CountrySeed } from '../../../prisma/seed/reference.js';

const aliases = loadAliasSeeds();
const countries = JSON.parse(
  readFileSync(new URL('../../../prisma/seed/countries.json', import.meta.url), 'utf8'),
) as CountrySeed[];
const sourceNames = JSON.parse(
  readFileSync(new URL('../../fixtures/api-ninjas/names-2023-03-09.json', import.meta.url), 'utf8'),
) as { country: string; region: string }[];

describe('versioned aliases.json', () => {
  it('has 202 aliases with unique source names', () => {
    expect(aliases).toHaveLength(202);
    expect(new Set(aliases.map((alias) => alias.sourceName)).size).toBe(202);
  });

  it('points every mapped alias at a seeded country', () => {
    const codes = new Set(countries.map((country) => country.code));
    const dangling = aliases.filter(
      (alias) => alias.status === 'mapped' && !codes.has(alias.countryCode),
    );
    expect(dangling).toEqual([]);
  });

  it('maps every country name the source returned on 2023-03-09', () => {
    const mapped = new Set(
      aliases.filter((alias) => alias.status === 'mapped').map((alias) => alias.sourceName),
    );
    const missing = [...new Set(sourceNames.map((row) => row.country))].filter(
      (name) => !mapped.has(name),
    );
    expect(missing).toEqual([]);
  });
});

describe('parseAliasSeeds', () => {
  it('rejects duplicated source names', () => {
    const alias = { sourceName: 'Brazil', countryCode: 'BRA', status: 'mapped' };
    expect(() => parseAliasSeeds([alias, alias])).toThrow(/duplicate sourceName/);
  });

  it('rejects a mapped alias without a country code', () => {
    expect(() =>
      parseAliasSeeds([{ sourceName: 'Brazil', countryCode: null, status: 'mapped' }]),
    ).toThrow(/Invalid aliases.json/);
  });

  it('accepts an ignored alias without a country code', () => {
    expect(
      parseAliasSeeds([{ sourceName: 'Ghost Ship', countryCode: null, status: 'ignored' }]),
    ).toEqual([{ sourceName: 'Ghost Ship', countryCode: null, status: 'ignored' }]);
  });
});
