import type { Feature, Geometry } from 'geojson';
import type { Layer, Path, PathOptions } from 'leaflet';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GeoJSON } from 'react-leaflet';
import { useMapColors, type MapColors } from './map-colors';
import { resolvePolygonCode } from './polygon-links';
import type { CountryGeo, GeoProperties } from './use-geo';

function polygonStyle(colors: MapColors, selected: boolean, fill: string | undefined): PathOptions {
  return {
    color: selected ? colors.countrySelected : colors.countryStroke,
    weight: selected ? 1.5 : 0.5,
    fillColor: fill ?? colors.countryFill,
    fillOpacity: fill === undefined ? 0.3 : 0.8,
  };
}

interface CountryPolygonsProps {
  geo: CountryGeo;
  knownCodes: ReadonlySet<string>;
  selectedCode: string | null;
  // Choropleth fills by country code; null in the markers view.
  fills: ReadonlyMap<string, string> | null;
  onSelect: (code: string) => void;
}

export function CountryPolygons({
  geo,
  knownCodes,
  selectedCode,
  fills,
  onSelect,
}: CountryPolygonsProps) {
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const colors = useMapColors();
  const style = useCallback(
    (feature?: Feature<Geometry, GeoProperties>) => {
      const code = feature ? resolvePolygonCode(feature.properties.iso3, knownCodes) : null;
      // In the choropleth, polygons outside the base (TKM, Antarctica) have no data either.
      const fill =
        fills === null
          ? undefined
          : ((code !== null ? fills.get(code) : undefined) ?? colors.noData);
      return polygonStyle(colors, code !== null && code === selectedCode, fill);
    },
    [knownCodes, selectedCode, colors, fills],
  );

  // onEachFeature only runs when the layer is created, so the layer is remounted (key) when
  // the known codes change.
  const onEachFeature = useCallback(
    (feature: Feature<Geometry, GeoProperties>, layer: Layer) => {
      const iso3 = feature.properties.iso3;
      const code = resolvePolygonCode(iso3, knownCodes);
      layer.on('add', () => {
        const element = (layer as Path).getElement();
        if (!element) return;
        element.classList.add('country-polygon');
        element.setAttribute('data-iso3', iso3);
        if (code !== null) {
          element.classList.add('is-clickable');
          element.setAttribute('data-code', code);
        }
      });
      if (code !== null) {
        layer.on('click', () => onSelectRef.current(code));
      }
    },
    [knownCodes],
  );

  const key = useMemo(() => [...knownCodes].sort().join(','), [knownCodes]);
  return <GeoJSON key={key} data={geo} style={style} onEachFeature={onEachFeature} />;
}
