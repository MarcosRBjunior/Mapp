import type { CountryListItem, Metric } from '../../shared/api/types';
import type { MapColors } from './map-colors';
import { choroplethBreaks, choroplethClass } from './choropleth-scale';
import { maxTotal } from './marker-scale';

// Fill of each country code in the choropleth: its class color, or the no-data fill.
export function choroplethFills(
  countries: readonly CountryListItem[],
  metric: Metric,
  colors: MapColors,
): Map<string, string> {
  const breaks = choroplethBreaks(maxTotal(countries));
  const ramp = colors.ramp[metric];
  return new Map(
    countries.map((country) => {
      const index = choroplethClass(country.total, breaks);
      return [country.code, index === null ? colors.noData : (ramp[index] ?? colors.noData)];
    }),
  );
}
