import { fireEvent, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { countryDetailFixture } from '../../test/fixtures';
import { API, errorBody } from '../../test/handlers';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { CountryCard } from './country-card';

describe('CountryCard', () => {
  it('asks to select a country when there is none', () => {
    renderWithProviders(<CountryCard code={null} metric="cases" />);

    const card = screen.getByRole('region', { name: 'Por país' });
    expect(within(card).getByText('Selecione um país no mapa ou na busca')).toBeInTheDocument();
  });

  it('shows total, share and rank of the active metric', async () => {
    renderWithProviders(<CountryCard code="BRA" metric="cases" />);

    const card = await screen.findByRole('region', { name: 'Brasil' });
    expect(within(card).getByText('Total de casos')).toBeInTheDocument();
    expect(within(card).getByText('300.000')).toBeInTheDocument();
    expect(within(card).getByText('30,0%')).toBeInTheDocument();
    expect(within(card).getByText('nº 2 de 4')).toBeInTheDocument();
    expect(within(card).getByText('Data: 09/03/2023')).toBeInTheDocument();
  });

  it('follows the metric', async () => {
    renderWithProviders(<CountryCard code="BRA" metric="deaths" />);

    const card = await screen.findByRole('region', { name: 'Brasil' });
    expect(within(card).getByText('Total de mortes')).toBeInTheDocument();
    expect(within(card).getByText('6.000')).toBeInTheDocument();
    expect(within(card).getByText('32,4%')).toBeInTheDocument();
  });

  it('shows a dash for a null share or rank', async () => {
    const detail = countryDetailFixture('BRA');
    if (!detail) throw new Error('fixture missing');
    server.use(
      http.get(`${API}/api/v1/countries/:code`, () =>
        HttpResponse.json({
          ...detail,
          comparison: { ...detail.comparison, cases: { share: null, rank: null, rankedCount: 4 } },
        }),
      ),
    );
    renderWithProviders(<CountryCard code="BRA" metric="cases" />);

    const card = await screen.findByRole('region', { name: 'Brasil' });
    expect(within(card).getAllByText('—')).toHaveLength(2);
  });

  it('says when the country has no data', async () => {
    renderWithProviders(<CountryCard code="ZWE" metric="cases" />);

    expect(
      await screen.findByText('Sem dados para este país na data de referência'),
    ).toBeInTheDocument();
  });

  it('treats a 404 as no selection', async () => {
    renderWithProviders(<CountryCard code="XYZ" metric="cases" />);

    expect(await screen.findByText('Selecione um país no mapa ou na busca')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a local error and retries', async () => {
    server.use(
      http.get(`${API}/api/v1/countries/:code`, () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
      ),
    );
    renderWithProviders(<CountryCard code="BRA" metric="cases" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os dados do país',
    );
    server.resetHandlers();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('300.000')).toBeInTheDocument();
  });
});
