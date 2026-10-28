import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo } from 'react';
import { MapContainer, Pane, TileLayer, useMap } from 'react-leaflet';
import { Card } from '@/components/ui/card';
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
  selectionKey: string;
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
  selectionKey,
  onSelect,
}: WorldMapProps) {
  const { tilesUrl, tilesAttribution } = getEnv();
  const geo = useGeo();
  const knownCodes = useMemo(
    () => new Set((countries ?? []).map((country) => country.code)),
    [countries],
  );

  return (
    <Card className="relative isolate gap-0 overflow-hidden py-0">
      <MapContainer
        className="h-[360px] w-full md:h-[480px]"
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
            selectionKey={selectionKey}
            onSelect={onSelect}
          />
        )}
        <SelectionFocus countries={countries} selectedCode={selectedCode} />
      </MapContainer>
      {countries && <MapLegend countries={countries} metric={metric} />}
      {countriesStatus === 'pending' && (
        <div className="absolute inset-0 z-[900] flex items-center justify-center bg-background/60 p-4">
          <Skeleton label="Carregando países" height="100%" className="pointer-events-none" />
        </div>
      )}
      {countriesStatus === 'error' && (
        <div className="absolute inset-0 z-[900] flex items-center justify-center bg-background/60 p-4">
          <ErrorState message="Não foi possível carregar os países" onRetry={onRetry} />
        </div>
      )}
      {geo.isError && (
        <p className="absolute top-2 right-2 z-[900] m-0 rounded bg-background px-2 py-1 text-xs">
          Contornos indisponíveis
        </p>
      )}
    </Card>
  );
}
