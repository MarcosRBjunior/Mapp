import { ChoiceToggle } from '../../shared/ui/choice-toggle';
import { MAP_VIEWS, type MapView } from '../../shared/url/use-map-view';

const LABELS: Record<MapView, string> = { markers: 'Marcadores', choropleth: 'Cores' };

export function MapViewToggle({
  view,
  onChange,
}: {
  view: MapView;
  onChange: (view: MapView) => void;
}) {
  return (
    <ChoiceToggle
      label="Vista do mapa"
      value={view}
      options={MAP_VIEWS}
      labels={LABELS}
      onChange={onChange}
      size="sm"
      className="bg-background"
    />
  );
}
