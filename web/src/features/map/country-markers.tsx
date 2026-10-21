import type { CircleMarker as LeafletCircleMarker } from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { CircleMarker, Popup, Tooltip } from 'react-leaflet';
import type { CountryListItem, Metric } from '../../shared/api/types';
import { METRIC_LABELS, formatDate, formatNumber } from '../../shared/format/format';
import { METRIC_COLORS, markerRadius, maxTotal } from './marker-scale';

type MappableCountry = CountryListItem & { lat: number; lng: number; total: number };

function isMappable(country: CountryListItem): country is MappableCountry {
  return country.lat !== null && country.lng !== null && (country.total ?? 0) > 0;
}

interface CountryMarkersProps {
  countries: readonly CountryListItem[];
  metric: Metric;
  referenceDate: string | undefined;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

export function CountryMarkers({
  countries,
  metric,
  referenceDate,
  selectedCode,
  onSelect,
}: CountryMarkersProps) {
  const max = useMemo(() => maxTotal(countries), [countries]);
  // Biggest first, so smaller markers are drawn on top and stay clickable.
  const visible = useMemo(
    () => countries.filter(isMappable).sort((a, b) => b.total - a.total),
    [countries],
  );

  return (
    <>
      {visible.map((country) => (
        <CountryMarker
          key={`${metric}-${country.code}`}
          country={country}
          metric={metric}
          radius={markerRadius(country.total, max)}
          referenceDate={referenceDate}
          selected={country.code === selectedCode}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

interface CountryMarkerProps {
  country: MappableCountry;
  metric: Metric;
  radius: number;
  referenceDate: string | undefined;
  selected: boolean;
  onSelect: (code: string) => void;
}

function CountryMarker({
  country,
  metric,
  radius,
  referenceDate,
  selected,
  onSelect,
}: CountryMarkerProps) {
  const markerRef = useRef<LeafletCircleMarker>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const code = country.code;
  const label = `${country.name}: ${formatNumber(country.total)} ${METRIC_LABELS[metric].noun}`;

  // Leaflet draws an SVG path; make it reachable and usable from the keyboard.
  useEffect(() => {
    const marker = markerRef.current;
    const element = marker?.getElement() as SVGElement | undefined;
    if (!marker || !element) return;
    element.setAttribute('tabindex', '0');
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', label);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelectRef.current(code);
      }
    };
    const onFocus = () => marker.openTooltip();
    const onBlur = () => marker.closeTooltip();
    element.addEventListener('keydown', onKeyDown);
    element.addEventListener('focus', onFocus);
    element.addEventListener('blur', onBlur);
    return () => {
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('focus', onFocus);
      element.removeEventListener('blur', onBlur);
    };
  }, [code, label]);

  useEffect(() => {
    if (selected) markerRef.current?.openPopup();
  }, [selected]);

  const eventHandlers = useMemo(() => ({ click: () => onSelectRef.current(code) }), [code]);

  return (
    <CircleMarker
      ref={markerRef}
      center={[country.lat, country.lng]}
      radius={radius}
      pathOptions={{
        color: selected ? '#111827' : '#ffffff',
        weight: selected ? 2 : 1,
        fillColor: METRIC_COLORS[metric],
        fillOpacity: selected ? 0.9 : 0.6,
      }}
      bubblingMouseEvents={false}
      eventHandlers={eventHandlers}
    >
      <Tooltip>{label}</Tooltip>
      <Popup>
        <strong>{country.name}</strong>
        <br />
        {`${METRIC_LABELS[metric].title}: ${formatNumber(country.total)}`}
        <br />
        {`Novos no dia: ${formatNumber(country.new)}`}
        {referenceDate && (
          <>
            <br />
            {`Data: ${formatDate(referenceDate)}`}
          </>
        )}
      </Popup>
    </CircleMarker>
  );
}
