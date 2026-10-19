import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountrySeed } from '../../../prisma/seed/reference.js';

const countries = JSON.parse(
  readFileSync(new URL('../../../prisma/seed/countries.json', import.meta.url), 'utf8'),
) as CountrySeed[];

describe('versioned countries.json', () => {
  it('has 202 entries with unique three-letter codes', () => {
    const codes = countries.map((country) => country.code);
    expect(codes).toHaveLength(202);
    expect(new Set(codes).size).toBe(202);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('has 198 countries with coordinates and 4 non-geographic entities', () => {
    const geographic = countries.filter((country) => country.kind === 'country');
    expect(geographic).toHaveLength(198);
    expect(geographic.every((country) => country.lat !== null && country.lng !== null)).toBe(true);
    expect(
      countries
        .filter((country) => country.kind === 'non_geographic')
        .map((country) => country.code),
    ).toEqual(['XDP', 'XMZ', 'XSO', 'XWO']);
  });
});
