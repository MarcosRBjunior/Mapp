import { describe, expect, it } from 'vitest';
import { filterCountries, normalize } from './normalize';

const countries = [
  { code: 'ZWE', name: 'Zimbábue' },
  { code: 'IND', name: 'Índia' },
  { code: 'BRA', name: 'Brasil' },
  { code: 'DNK', name: 'Dinamarca' },
];

describe('normalize', () => {
  it('lowercases, trims and strips accents', () => {
    expect(normalize('Índia')).toBe('india');
    expect(normalize('  São Tomé ')).toBe('sao tome');
  });
});

describe('filterCountries', () => {
  it('matches ignoring accents and case, in pt-BR order', () => {
    expect(filterCountries(countries, 'INDIA').map((c) => c.code)).toEqual(['IND']);
    expect(filterCountries(countries, 'a').map((c) => c.code)).toEqual([
      'BRA',
      'DNK',
      'IND',
      'ZWE',
    ]);
  });

  it('returns nothing for an empty query and respects the limit', () => {
    expect(filterCountries(countries, '   ')).toEqual([]);
    expect(filterCountries(countries, 'a', 2)).toHaveLength(2);
  });
});
