import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { AboutPage } from './about-page';

describe('AboutPage', () => {
  it('shows the source, coverage and last sync', async () => {
    renderWithProviders(<AboutPage />);

    expect(await screen.findByRole('link', { name: 'API Ninjas' })).toHaveAttribute(
      'href',
      'https://api-ninjas.com/api/covid19',
    );
    expect(screen.getByText('Cobertura: de 22/01/2020 a 09/03/2023, 4 países')).toBeInTheDocument();
    expect(screen.getByText('Última sincronização: 19/10/2026 (concluída)')).toBeInTheDocument();
  });

  it('lists every attribution and the territories rule', () => {
    renderWithProviders(<AboutPage />);

    // The numbers come from JHU CSSE (directly or through API Ninjas); the Fonte section names the source in use.
    expect(screen.getByText(/^JHU CSSE —/)).toHaveTextContent(
      'JHU CSSE — números de casos e mortes e tabela de referência de países e coordenadas (CC BY 4.0).',
    );
    expect(screen.queryByText(/^API Ninjas —/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Natural Earth —/)).toHaveTextContent('domínio público');
    expect(screen.getByText('Tiles do mapa: © Tiles de teste')).toBeInTheDocument();
    expect(screen.getByText(/Groenlândia/)).toBeInTheDocument();
  });

  it('lists the non-geographic entities', async () => {
    renderWithProviders(<AboutPage />);

    expect(await screen.findByText('Navio Diamond Princess')).toBeInTheDocument();
    expect(
      screen.getByText('Entram no total global, mas não aparecem no mapa.'),
    ).toBeInTheDocument();
  });
});
