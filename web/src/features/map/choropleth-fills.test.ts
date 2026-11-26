import { describe, expect, it } from 'vitest';
import type { CountryListItem } from '../../shared/api/types';
import { choroplethFills } from './choropleth-fills';
import { DARK_MAP_COLORS, LIGHT_MAP_COLORS } from './map-colors';

describe('choroplethFills', () => {
  const country = (code: string, total: number | null): CountryListItem => ({
    code,
    name: code,
    lat: 0,
    lng: 0,
    total,
    new: null,
  });
  const countries = [country('AAA', 1_000_000), country('BBB', 50), country('CCC', null)];

  it('colors each country by its class, and the ones without data with the no-data fill', () => {
    const fills = choroplethFills(countries, 'cases', LIGHT_MAP_COLORS);

    expect(fills.get('AAA')).toBe(LIGHT_MAP_COLORS.ramp.cases[4]);
    expect(fills.get('BBB')).toBe(LIGHT_MAP_COLORS.ramp.cases[0]);
    expect(fills.get('CCC')).toBe(LIGHT_MAP_COLORS.noData);
  });

  it('uses the ramp of the metric and of the theme', () => {
    expect(choroplethFills(countries, 'deaths', DARK_MAP_COLORS).get('AAA')).toBe(
      DARK_MAP_COLORS.ramp.deaths[4],
    );
  });
});
