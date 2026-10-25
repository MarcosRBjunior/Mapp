import type { CircleMarker as LeafletCircleMarker } from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { CircleMarker, Popup, Tooltip } from 'react-leaflet';
import type { CountryListItem, Metric } from '../../shared/api/types';
import { CountrySparkline } from '../charts/country-sparkline';
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
        // Already selected: the selection effect will not run again, so open it here.
        marker.openPopup();
      } else if (event.key === 'Escape') {
        marker.closePopup();
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

  // Esc inside the popup closes it; when the focus was inside, it goes back to the marker.
  useEffect(() => {
    const marker = markerRef.current;
    const element = marker?.getElement() as SVGElement | undefined;
    if (!marker || !element) return;
    let focusInside = false;
    const onPopupKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') marker.closePopup();
    };
    const onFocusIn = () => {
      focusInside = true;
    };
    // Focus moving to another element outside the popup (e.g. the search) is not "inside" anymore.
    // A null relatedTarget (popup removed while focused) keeps the flag.
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      const popup = marker.getPopup()?.getElement();
      if (next instanceof Node && popup && !popup.contains(next)) focusInside = false;
    };
    const onOpen = () => {
      focusInside = false;
      const popup = marker.getPopup()?.getElement();
      popup?.querySelector('.leaflet-popup-close-button')?.setAttribute('aria-label', 'Fechar');
      popup?.addEventListener('focusout', onFocusOut);
      popup?.addEventListener('keydown', onPopupKeyDown);
      popup?.addEventListener('focusin', onFocusIn);
    };
    const onClose = () => {
      const popup = marker.getPopup()?.getElement();
      popup?.removeEventListener('keydown', onPopupKeyDown);
      popup?.removeEventListener('focusin', onFocusIn);
      popup?.removeEventListener('focusout', onFocusOut);
      if (focusInside) element.focus();
    };
    marker.on('popupopen', onOpen);
    marker.on('popupclose', onClose);
    return () => {
      marker.off('popupopen', onOpen);
      marker.off('popupclose', onClose);
    };
  }, []);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    if (selected) marker.openPopup();
    else marker.closePopup();
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
        <div className="flex flex-col gap-2">
          <p className="m-0">
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
          </p>
          <CountrySparkline code={code} name={country.name} metric={metric} />
        </div>
      </Popup>
    </CircleMarker>
  );
}
