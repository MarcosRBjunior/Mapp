import { fireEvent, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, errorBody } from '../../test/handlers';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { GlobalCard } from './global-card';

describe('GlobalCard', () => {
  it('shows cases and deaths with total and new values', async () => {
    renderWithProviders(<GlobalCard />);

    const card = screen.getByRole('region', { name: 'Geral' });
    expect(await within(card).findByText('Total: 1.000.000')).toBeInTheDocument();
    expect(within(card).getByText('Novos no dia: 1.200')).toBeInTheDocument();
    expect(within(card).getByText('Total: 18.500')).toBeInTheDocument();
    expect(within(card).getByText('Novos no dia: 20')).toBeInTheDocument();
    expect(within(card).getByText('Data: 09/03/2023')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    renderWithProviders(<GlobalCard />);

    expect(screen.getByRole('status', { name: 'Carregando números globais' })).toBeInTheDocument();
  });

  it('shows a local error and retries', async () => {
    server.use(
      http.get(`${API}/api/v1/global`, () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
      ),
    );
    renderWithProviders(<GlobalCard />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os números globais',
    );
    server.resetHandlers();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Total: 1.000.000')).toBeInTheDocument();
  });

  it('shows an empty state when the API has no data yet', async () => {
    server.use(
      http.get(`${API}/api/v1/global`, () =>
        HttpResponse.json(errorBody('DATA_NOT_READY', 'no data'), { status: 503 }),
      ),
    );
    renderWithProviders(<GlobalCard />);

    expect(await screen.findByText('Dados ainda não carregados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });
});
