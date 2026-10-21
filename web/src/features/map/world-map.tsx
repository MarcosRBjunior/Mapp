import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo } from 'react';
import { MapContainer, Pane, TileLayer, useMap } from 'react-leaflet';
import { getEnv } from '../../config/env';
import type { CountryListItem, Metric } from '../../shared/api/types';
import { ErrorState } from '../../shared/ui/error-state';
import { Skeleton } from '../../shared/ui/skeleton';
import { CountryMarkers } from './country-markers';
import { CountryPolygons } from './country-polygons';
import { MapLegend } from './map-legend';
import { useGeo } from './use-geo';

export interface WorldMapProps {
  metric: Metric;
  countries: readonly CountryListItem[] | undefined;
  countriesStatus: 'pending' | 'error' | 'success';
  onRetry: () => void;
  referenceDate: string | undefined;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

function SelectionFocus({
  countries,
  selectedCode,
}: {
  countries: readonly CountryListItem[] | undefined;
  selectedCode: string | null;
}) {
  const map = useMap();
  const target = countries?.find((country) => country.code === selectedCode);
  const lat = target?.lat ?? null;
  const lng = target?.lng ?? null;

  useEffect(() => {
    if (lat === null || lng === null) return;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 3), { duration: 0.6 });
  }, [map, lat, lng]);

  return null;
}

export function WorldMap({
  metric,
  countries,
  countriesStatus,
  onRetry,
  referenceDate,
  selectedCode,
  onSelect,
}: WorldMapProps) {
  const { tilesUrl, tilesAttribution } = getEnv();
  const geo = useGeo();
  const knownCodes = useMemo(
    () => new Set((countries ?? []).map((country) => country.code)),
    [countries],
  );

  return (
    <div className="map-panel">
      <MapContainer
        className="world-map"
        center={[30, 10]}
        zoom={2}
        minZoom={2}
        worldCopyJump
        aria-label="Mapa-múndi"
      >
        <TileLayer url={tilesUrl} attribution={tilesAttribution} />
        {/* Own pane below the markers (overlayPane is 400), so polygons never cover them. */}
        <Pane name="countries" style={{ zIndex: 350 }}>
          {geo.data && (
            <CountryPolygons
              geo={geo.data}
              knownCodes={knownCodes}
              selectedCode={selectedCode}
              onSelect={onSelect}
            />
          )}
        </Pane>
        {countries && (
          <CountryMarkers
            countries={countries}
            metric={metric}
            referenceDate={referenceDate}
            selectedCode={selectedCode}
            onSelect={onSelect}
          />
        )}
        <SelectionFocus countries={countries} selectedCode={selectedCode} />
      </MapContainer>
      {countries && <MapLegend countries={countries} metric={metric} />}
      {countriesStatus === 'pending' && (
        <div className="map-overlay">
          <Skeleton label="Carregando países" height="100%" />
        </div>
      )}
      {countriesStatus === 'error' && (
        <div className="map-overlay">
          <ErrorState message="Não foi possível carregar os países" onRetry={onRetry} />
        </div>
      )}
      {geo.isError && <p className="map-note">Contornos indisponíveis</p>}
    </div>
  );
}
