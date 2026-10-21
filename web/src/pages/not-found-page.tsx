import { useEffect } from 'react';
import { Link } from 'react-router';

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Página não encontrada — Mapp';
  }, []);

  return (
    <section className="not-found">
      <h2>Página não encontrada</h2>
      <p>
        <Link to="/">Voltar ao mapa</Link>
      </p>
    </section>
  );
}
