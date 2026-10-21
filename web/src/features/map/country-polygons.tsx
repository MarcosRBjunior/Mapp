import type { Feature, Geometry } from 'geojson';
import type { Layer, Path, PathOptions } from 'leaflet';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GeoJSON } from 'react-leaflet';
import { resolvePolygonCode } from './polygon-links';
import type { CountryGeo, GeoProperties } from './use-geo';

const BASE_STYLE: PathOptions = {
  color: '#9ca3af',
  weight: 0.5,
  fillColor: '#e5e7eb',
  fillOpacity: 0.3,
};
const SELECTED_STYLE: PathOptions = { ...BASE_STYLE, color: '#1f2937', weight: 1.5 };

interface CountryPolygonsProps {
  geo: CountryGeo;
  knownCodes: ReadonlySet<string>;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

export function CountryPolygons({ geo, knownCodes, selectedCode, onSelect }: CountryPolygonsProps) {
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const style = useCallback(
    (feature?: Feature<Geometry, GeoProperties>) => {
      const code = feature ? resolvePolygonCode(feature.properties.iso3, knownCodes) : null;
      return code !== null && code === selectedCode ? SELECTED_STYLE : BASE_STYLE;
    },
    [knownCodes, selectedCode],
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
