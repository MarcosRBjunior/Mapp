import { useQuery } from '@tanstack/react-query';
import type { FeatureCollection, Geometry } from 'geojson';

export interface GeoProperties {
  iso3: string;
  name: string;
}

export type CountryGeo = FeatureCollection<Geometry, GeoProperties>;

async function fetchGeo(): Promise<CountryGeo> {
  const response = await fetch('/geo/countries-110m.geojson');
  if (!response.ok) throw new Error(`GeoJSON request failed with HTTP ${response.status}`);
  return (await response.json()) as CountryGeo;
}

export function useGeo() {
  return useQuery({ queryKey: ['geo'], queryFn: fetchGeo, staleTime: Infinity });
}
