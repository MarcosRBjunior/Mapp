import { describe, expect, it } from 'vitest';
import { SOVEREIGN, resolvePolygonCode } from './polygon-links';

const known = new Set(['BRA', 'DNK', 'USA', 'GBR', 'FRA', 'SOM', 'CYP']);

describe('resolvePolygonCode', () => {
  it('keeps a code that is a country in the database', () => {
    expect(resolvePolygonCode('BRA', known)).toBe('BRA');
  });

  it.each([
    ['GRL', 'DNK'],
    ['PRI', 'USA'],
    ['FLK', 'GBR'],
    ['NCL', 'FRA'],
    ['ATF', 'FRA'],
    ['SOL', 'SOM'],
    ['CYN', 'CYP'],
  ])('sends the territory %s to its sovereign %s', (iso3, sovereign) => {
    expect(resolvePolygonCode(iso3, known)).toBe(sovereign);
  });

  it('lists exactly the seven territories', () => {
    expect(Object.keys(SOVEREIGN).sort()).toEqual([
      'ATF',
      'CYN',
      'FLK',
      'GRL',
      'NCL',
      'PRI',
      'SOL',
    ]);
  });

  it('leaves Turkmenistan and unknown codes without a link', () => {
    expect(resolvePolygonCode('TKM', known)).toBeNull();
    expect(resolvePolygonCode('XXX', known)).toBeNull();
  });

  it('gives no link when the sovereign is not in the list', () => {
    expect(resolvePolygonCode('GRL', new Set(['BRA']))).toBeNull();
  });
});
