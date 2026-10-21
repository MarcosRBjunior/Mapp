import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { WorldMapProps } from '../features/map/world-map';
import { API, errorBody } from '../test/handlers';
import { renderWithProviders } from '../test/render';
import { server } from '../test/server';
import { DashboardPage } from './dashboard-page';

vi.mock('../features/map/world-map', () => ({
  WorldMap: ({ selectedCode, onSelect }: WorldMapProps) => (
    <div data-testid="world-map" data-selected={selectedCode ?? ''}>
      <button type="button" onClick={() => onSelect('IND')}>
        Selecionar Índia no mapa
      </button>
    </div>
  ),
}));

const PATHS = ['/', '/paises/:code'];

describe('DashboardPage', () => {
  it('shows the selected country in the card and on the map', async () => {
    renderWithProviders(<DashboardPage />, { route: '/paises/BRA', path: PATHS });

    const card = await screen.findByRole('region', { name: 'Brasil' });
    expect(within(card).getByText('300.000')).toBeInTheDocument();
    expect(screen.getByTestId('world-map')).toHaveAttribute('data-selected', 'BRA');
    await waitFor(() => expect(document.title).toBe('Brasil — Mapp'));
  });

  it('warns about an unknown country and keeps the world view', async () => {
    renderWithProviders(<DashboardPage />, { route: '/paises/XYZ', path: PATHS });

    expect(await screen.findByText('País não encontrado: XYZ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar à visão mundial' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('region', { name: 'Por país' })).toHaveTextContent(
      'Selecione um país no mapa ou na busca',
    );
    expect(screen.getByTestId('world-map')).toHaveAttribute('data-selected', '');
  });

  it('does not call the API for a code with an invalid format', async () => {
    const calls: string[] = [];
    server.use(
      http.get(`${API}/api/v1/countries/:code`, ({ params }) => {
        calls.push(typeof params.code === 'string' ? params.code : '');
        return HttpResponse.json(errorBody('COUNTRY_NOT_FOUND', 'x'), { status: 404 });
      }),
    );
    renderWithProviders(<DashboardPage />, { route: '/paises/12', path: PATHS });

    expect(screen.getByText('País não encontrado: 12')).toBeInTheDocument();
    await screen.findByText('Total: 1.000.000');
    expect(calls).toEqual([]);
  });

  it('redirects a lowercase code to uppercase and keeps the query', async () => {
    renderWithProviders(<DashboardPage />, { route: '/paises/bra?metric=deaths', path: PATHS });

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/paises/BRA?metric=deaths'),
    );
  });

  it('navigates to the country chosen on the map and keeps the metric', async () => {
    renderWithProviders(<DashboardPage />, { route: '/?metric=deaths', path: PATHS });

    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Índia no mapa' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/paises/IND?metric=deaths'),
    );
    expect(await screen.findByRole('region', { name: 'Índia' })).toBeInTheDocument();
  });

  it('switches the metric of the country card', async () => {
    renderWithProviders(<DashboardPage />, { route: '/paises/BRA', path: PATHS });
    await screen.findByText('300.000');

    fireEvent.click(screen.getByRole('button', { name: 'Mortes' }));

    expect(await screen.findByText('6.000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mortes' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('location')).toHaveTextContent('/paises/BRA?metric=deaths');
  });

  it('keeps the country card working when the global card fails', async () => {
    server.use(
      http.get(`${API}/api/v1/global`, () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
      ),
    );
    renderWithProviders(<DashboardPage />, { route: '/paises/BRA', path: PATHS });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os números globais',
    );
    expect(await screen.findByText('300.000')).toBeInTheDocument();
  });

  it('searches and opens a country', async () => {
    renderWithProviders(<DashboardPage />, { route: '/', path: PATHS });
    const input = screen.getByRole('combobox', { name: 'Buscar país' });
    await waitFor(() => expect(input).toBeEnabled());

    fireEvent.change(input, { target: { value: 'dinamarca' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/paises/DNK'));
  });
});
