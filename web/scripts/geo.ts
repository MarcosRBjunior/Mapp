export interface CountryFeatureProperties {
  iso3: string;
  name: string;
}

export interface SourceProperties {
  ISO_A3_EH?: unknown;
  ADM0_A3?: unknown;
  NAME?: unknown;
  NAME_PT?: unknown;
}

export interface Feature<P> {
  type: 'Feature';
  properties: P;
  geometry: unknown;
}

export interface FeatureCollection<P> {
  type: 'FeatureCollection';
  features: Feature<P>[];
}

const CODE_OVERRIDES: ReadonlyMap<string, string> = new Map([['KOS', 'XKS']]);

export function toCountryGeo(
  source: FeatureCollection<SourceProperties>,
): FeatureCollection<CountryFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: source.features.map((feature) => {
      const { ISO_A3_EH, ADM0_A3, NAME, NAME_PT } = feature.properties;
      const code = ISO_A3_EH === '-99' ? ADM0_A3 : ISO_A3_EH;
      if (typeof code !== 'string' || typeof NAME !== 'string') {
        throw new Error(`Feature without a usable code or name: ${JSON.stringify(NAME)}`);
      }
      const name = typeof NAME_PT === 'string' && NAME_PT !== '' ? NAME_PT : NAME;
      return {
        type: 'Feature',
        properties: { iso3: CODE_OVERRIDES.get(code) ?? code, name },
        geometry: feature.geometry,
      };
    }),
  };
}
