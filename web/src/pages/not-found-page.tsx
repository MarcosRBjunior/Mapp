import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { dashboardSearch } from '../shared/url/dashboard-search';

export function NotFoundPage() {
  const { search } = useLocation();
  useEffect(() => {
    document.title = 'Página não encontrada — Mapp';
  }, []);

  return (
    <section className="flex flex-col gap-2 px-4 py-6 lg:px-6">
      <h2 className="text-2xl font-semibold">Página não encontrada</h2>
      <p>
        <Link
          className="font-medium underline underline-offset-4"
          to={{ pathname: '/', search: dashboardSearch(search) }}
        >
          Voltar ao mapa
        </Link>
      </p>
    </section>
  );
}
