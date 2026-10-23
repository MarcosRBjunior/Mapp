import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { WorldMapProps } from '../features/map/world-map';
import { countriesFixture } from '../test/fixtures';
import { API } from '../test/handlers';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';
import { App } from './app';

vi.mock('../features/map/world-map', () => ({
  WorldMap: ({ countries }: WorldMapProps) => (
    <div data-testid="world-map" data-count={countries?.length ?? 0} />
  ),
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

  it('shows the dashboard controls only on dashboard routes', async () => {
    renderWithProviders(<App />, { route: '/sobre' });

    await screen.findByRole('heading', { name: 'Sobre os dados' });
    expect(screen.queryByRole('group', { name: 'Métrica' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
  });

  it('switching the metric in the header updates the country card', async () => {
    renderWithProviders(<App />, { route: '/paises/BRA' });
    const card = await screen.findByRole('region', { name: 'Brasil' });
    await within(card).findByText('300.000');

    fireEvent.click(screen.getByRole('radio', { name: 'Mortes' }));

    expect(await within(card).findByText('6.000')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/paises/BRA?metric=deaths');
  });

  it('keeps the previous country list while the new metric loads', async () => {
    server.use(
      http.get(`${API}/api/v1/countries`, async ({ request }) => {
        const deaths = new URL(request.url).searchParams.get('metric') === 'deaths';
        if (deaths) await delay(200);
        return HttpResponse.json(countriesFixture(deaths ? 'deaths' : 'cases'));
      }),
    );
    renderWithProviders(<App />, { route: '/paises/BRA' });
    await waitFor(() => expect(screen.getByTestId('world-map')).toHaveAttribute('data-count', '5'));

    fireEvent.click(screen.getByRole('radio', { name: 'Mortes' }));

    expect(screen.getByTestId('world-map')).toHaveAttribute('data-count', '5');
    expect(screen.getByRole('combobox', { name: 'Buscar país' })).toBeEnabled();
  });
});
