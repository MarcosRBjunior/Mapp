import { useMeta } from '../api/queries';
import { tilesAttributionText } from '../format/tiles-attribution';

// RN-10: the source stays visible while /meta loads or fails (production reads JHU CSSE, ADR 0009).
const FALLBACK_SOURCE =
  'Fonte: COVID-19 Data Repository by CSSE at Johns Hopkins University (CC BY 4.0)';

export function SiteFooter() {
  const meta = useMeta();
  const tiles = tilesAttributionText();

  return (
    <footer className="mt-auto flex flex-col gap-1 border-t px-4 py-4 text-xs text-muted-foreground lg:px-6">
      <p>
        {meta.data
          ? `Fonte: ${meta.data.source.name} (${meta.data.source.license}) · ${meta.data.source.attribution}`
          : FALLBACK_SOURCE}
      </p>
      <p>{`Mapa: Natural Earth (domínio público) · Tiles: ${tiles}`}</p>
    </footer>
  );
}
