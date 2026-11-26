import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

export const MAP_VIEWS = ['markers', 'choropleth'] as const;
export type MapView = (typeof MAP_VIEWS)[number];

export function parseMapView(value: string | null): MapView {
  return value === 'choropleth' ? 'choropleth' : 'markers';
}

// Markers are the default and leave no `view` in the URL.
export function useMapView(): [MapView, (view: MapView) => void] {
  const [params, setParams] = useSearchParams();
  const view = parseMapView(params.get('view'));
  const setView = useCallback(
    (next: MapView) => {
      // A filter never creates a history step: only page/country navigation does.
      setParams(
        (previous) => {
          const updated = new URLSearchParams(previous);
          if (next === 'markers') updated.delete('view');
          else updated.set('view', next);
          return updated;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [view, setView];
}
