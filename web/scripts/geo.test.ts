import { describe, expect, it } from 'vitest';
import { toCountryGeo, type FeatureCollection, type SourceProperties } from './geo.js';

const polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};

const source = (...properties: SourceProperties[]): FeatureCollection<SourceProperties> => ({
  type: 'FeatureCollection',
  features: properties.map((props) => ({ type: 'Feature', properties: props, geometry: polygon })),
});

describe('toCountryGeo', () => {
  it('keeps only iso3 and name, and the geometry', () => {
    expect(
      toCountryGeo(
        source({
          ISO_A3_EH: 'BRA',
          ADM0_A3: 'BRA',
          NAME: 'Brazil',
          POP_EST: 1,
        } as SourceProperties),
      ),
    ).toEqual({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { iso3: 'BRA', name: 'Brazil' }, geometry: polygon },
      ],
    });
  });

  it('falls back to ADM0_A3 when ISO_A3_EH is -99', () => {
    const [feature] = toCountryGeo(
      source({ ISO_A3_EH: '-99', ADM0_A3: 'SOL', NAME: 'Somaliland' }),
    ).features;
    expect(feature?.properties.iso3).toBe('SOL');
  });

  it('uses the JHU code XKS for Kosovo', () => {
    const [feature] = toCountryGeo(
      source({ ISO_A3_EH: '-99', ADM0_A3: 'KOS', NAME: 'Kosovo' }),
    ).features;
    expect(feature?.properties.iso3).toBe('XKS');
  });

  it('rejects a feature without a usable code or name', () => {
    expect(() => toCountryGeo(source({ ISO_A3_EH: '-99', NAME: 'Nowhere' }))).toThrow(/Nowhere/);
  });
});
