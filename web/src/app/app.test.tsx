import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { App } from './app';

vi.mock('../features/map/world-map', () => ({
  WorldMap: () => <div data-testid="world-map" />,
}));

describe('App', () => {
  it('renders the layout with the Mapp heading, the banner and the map', async () => {
    renderWithProviders(<App />, { route: '/' });

    expect(screen.getByRole('heading', { level: 1, name: 'Mapp' })).toBeInTheDocument();
    expect(screen.getByTestId('world-map')).toBeInTheDocument();
    expect(await screen.findByText(/Dados históricos até 09\/03\/2023/)).toBeInTheDocument();
  });

  it('navigates to /sobre from the nav', async () => {
    renderWithProviders(<App />, { route: '/' });

    fireEvent.click(screen.getByRole('link', { name: 'Sobre' }));

    expect(await screen.findByRole('heading', { name: 'Sobre os dados' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/sobre');
  });

  it('shows the 404 page for an unknown route', () => {
    renderWithProviders(<App />, { route: '/rota-inexistente' });

    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao mapa' })).toHaveAttribute('href', '/');
  });

  it.each(['/', '/sobre', '/rota-inexistente'])(
    'shows source and tiles credits on %s',
    async (route) => {
      renderWithProviders(<App />, { route });

      expect(await screen.findByText(/^Fonte: API Ninjas \(/)).toBeInTheDocument();
      expect(screen.getByText(/Tiles: © Tiles de teste/)).toBeInTheDocument();
    },
  );
});
