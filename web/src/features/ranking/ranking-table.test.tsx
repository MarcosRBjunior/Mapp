import { fireEvent, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { rankingsFixture } from '../../test/fixtures';
import { API, errorBody } from '../../test/handlers';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { RankingTable } from './ranking-table';

describe('RankingTable', () => {
  it('lists the top countries by total with their share', async () => {
    renderWithProviders(<RankingTable metric="cases" selectedCode={null} />);

    const region = await screen.findByRole('region', { name: 'Top 10 — casos em 09/03/2023' });
    const rows = within(region).getAllByRole('row');
    expect(rows).toHaveLength(5);
    const first = rows[1];
    if (!first) throw new Error('row missing');
    expect(within(first).getByText('1')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'Estados Unidos' })).toHaveAttribute(
      'href',
      '/paises/USA',
    );
    expect(within(first).getByText('500.000')).toBeInTheDocument();
    expect(within(first).getByText('50,0%')).toBeInTheDocument();
    expect(
      within(region).getByRole('columnheader', { name: 'Total de casos' }),
    ).toBeInTheDocument();
  });

  it('asks for ten countries of the active metric', async () => {
    let requested: URL | undefined;
    server.use(
      http.get(`${API}/api/v1/rankings`, ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json(rankingsFixture('deaths', 10));
      }),
    );
    renderWithProviders(<RankingTable metric="deaths" selectedCode={null} />);

    await screen.findByRole('region', { name: 'Top 10 — mortes em 09/03/2023' });
    expect(requested?.searchParams.get('limit')).toBe('10');
    expect(requested?.searchParams.get('metric')).toBe('deaths');
  });

  it('keeps the query in the country links', async () => {
    renderWithProviders(<RankingTable metric="deaths" selectedCode={null} />, {
      route: '/?metric=deaths&period=7d',
    });

    expect(await screen.findByRole('link', { name: 'Brasil' })).toHaveAttribute(
      'href',
      '/paises/BRA?metric=deaths&period=7d',
    );
  });

  it('highlights the selected country', async () => {
    renderWithProviders(<RankingTable metric="cases" selectedCode="BRA" />);

    const link = await screen.findByRole('link', { name: 'Brasil' });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link.closest('tr')).toHaveAttribute('data-state', 'selected');
    expect(screen.getByRole('link', { name: 'Índia' })).not.toHaveAttribute('aria-current');
  });

  it('shows a dash for a null share', async () => {
    const ranking = rankingsFixture('cases', 10);
    server.use(
      http.get(`${API}/api/v1/rankings`, () =>
        HttpResponse.json({
          ...ranking,
          items: ranking.items.map((item) => ({ ...item, share: null })),
        }),
      ),
    );
    renderWithProviders(<RankingTable metric="cases" selectedCode={null} />);

    await screen.findByRole('link', { name: 'Brasil' });
    expect(screen.getAllByText('—')).toHaveLength(4);
  });

  it('says when there is no country to rank', async () => {
    server.use(
      http.get(`${API}/api/v1/rankings`, () =>
        HttpResponse.json({ ...rankingsFixture('cases', 10), rankedCount: 0, items: [] }),
      ),
    );
    renderWithProviders(<RankingTable metric="cases" selectedCode={null} />);

    expect(await screen.findByText('Sem dados na data de referência')).toBeInTheDocument();
  });

  it('says when no data was loaded yet', async () => {
    server.use(
      http.get(`${API}/api/v1/rankings`, () =>
        HttpResponse.json(errorBody('DATA_NOT_READY', 'no data'), { status: 503 }),
      ),
    );
    renderWithProviders(<RankingTable metric="cases" selectedCode={null} />);

    expect(await screen.findByText('Dados ainda não carregados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    renderWithProviders(<RankingTable metric="cases" selectedCode={null} />);

    expect(screen.getByRole('status', { name: 'Carregando ranking' })).toBeInTheDocument();
  });

  it('shows a local error and retries', async () => {
    server.use(
      http.get(`${API}/api/v1/rankings`, () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
      ),
    );
    renderWithProviders(<RankingTable metric="cases" selectedCode={null} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o ranking',
    );
    server.resetHandlers();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('link', { name: 'Brasil' })).toBeInTheDocument();
  });
});
