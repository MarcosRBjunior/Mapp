import { getEnv } from '../../config/env';
import { useMeta } from '../api/queries';
import { htmlToText } from '../format/html-to-text';

export function SiteFooter() {
  const meta = useMeta();
  const tiles = htmlToText(getEnv().tilesAttribution);

  return (
    <footer className="site-footer">
      {meta.data && (
        <p>{`Fonte: ${meta.data.source.name} (${meta.data.source.license}) · ${meta.data.source.attribution}`}</p>
      )}
      <p>{`Mapa: Natural Earth (domínio público) · Tiles: ${tiles}`}</p>
    </footer>
  );
}
