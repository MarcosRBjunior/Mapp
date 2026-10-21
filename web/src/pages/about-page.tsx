import { useEffect, type ReactNode } from 'react';
import { useMeta } from '../shared/api/queries';
import type { MetaResponse } from '../shared/api/types';
import { formatDate, formatNumber } from '../shared/format/format';
import { tilesAttributionText } from '../shared/format/tiles-attribution';
import { ErrorState } from '../shared/ui/error-state';
import { Skeleton } from '../shared/ui/skeleton';

type SyncStatus = NonNullable<MetaResponse['lastSync']>['status'];

const SYNC_STATUS: Record<SyncStatus, string> = {
  success: 'concluída',
  partial: 'parcial',
  failed: 'falhou',
};

const HTTP_URL = /^https?:\/\//;

export function AboutPage() {
  const meta = useMeta();
  const tiles = tilesAttributionText();

  useEffect(() => {
    document.title = 'Sobre — Mapp';
  }, []);

  let source: ReactNode;
  if (meta.isPending) {
    source = <Skeleton label="Carregando a fonte dos dados" height="4rem" />;
  } else if (meta.isError) {
    source = (
      <ErrorState
        message="Não foi possível carregar a fonte dos dados"
        onRetry={() => void meta.refetch()}
      />
    );
  } else {
    const { source: info, coverage, lastSync } = meta.data;
    source = (
      <>
        <p>
          {HTTP_URL.test(info.url) ? (
            <a href={info.url} target="_blank" rel="noopener noreferrer">
              {info.name}
            </a>
          ) : (
            info.name
          )}
          {` — ${info.license}. ${info.attribution}`}
        </p>
        <p>
          {coverage
            ? `Cobertura: de ${formatDate(coverage.from)} a ${formatDate(coverage.to)}, ${formatNumber(coverage.countries)} países`
            : 'Dados ainda não carregados'}
        </p>
        {lastSync && (
          <p>{`Última sincronização: ${formatDate(lastSync.finishedAt.slice(0, 10))} (${SYNC_STATUS[lastSync.status]})`}</p>
        )}
      </>
    );
  }

  return (
    <article className="about">
      <h2>Sobre os dados</h2>
      <section aria-labelledby="about-source">
        <h3 id="about-source">Fonte</h3>
        {source}
      </section>
      <section aria-labelledby="about-credits">
        <h3 id="about-credits">Atribuições</h3>
        <ul>
          <li>API Ninjas — fonte dos números de casos e mortes.</li>
          <li>JHU CSSE — tabela de referência de países e coordenadas (CC BY 4.0).</li>
          <li>Natural Earth — contornos dos países (domínio público).</li>
          <li>{`Tiles do mapa: ${tiles}`}</li>
        </ul>
      </section>
      <section aria-labelledby="about-territories">
        <h3 id="about-territories">Territórios no mapa</h3>
        <p>
          Polígonos de territórios sem dados próprios, como Groenlândia e Porto Rico, abrem o país
          soberano (Dinamarca e Estados Unidos).
        </p>
      </section>
      <section aria-labelledby="about-non-geographic">
        <h3 id="about-non-geographic">Entidades não geográficas</h3>
        <p>Entram no total global, mas não aparecem no mapa.</p>
        {meta.data && (
          <ul>
            {meta.data.nonGeographic.map((entity) => (
              <li key={entity.code}>{entity.name}</li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
