import { useEffect } from 'react';
import { Link } from 'react-router';

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Página não encontrada — Mapp';
  }, []);

  return (
    <section className="flex flex-col gap-2 px-4 py-6 lg:px-6">
      <h2 className="text-2xl font-semibold">Página não encontrada</h2>
      <p>
        <Link className="font-medium underline underline-offset-4" to="/">
          Voltar ao mapa
        </Link>
      </p>
    </section>
  );
}
