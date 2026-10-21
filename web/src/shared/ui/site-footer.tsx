import { useMeta } from '../api/queries';
import { tilesAttributionText } from '../format/tiles-attribution';

export function SiteFooter() {
  const meta = useMeta();
  const tiles = tilesAttributionText();

  return (
    <footer className="site-footer">
      {meta.data && (
        <p>{`Fonte: ${meta.data.source.name} (${meta.data.source.license}) · ${meta.data.source.attribution}`}</p>
      )}
      <p>{`Mapa: Natural Earth (domínio público) · Tiles: ${tiles}`}</p>
    </footer>
  );
}
