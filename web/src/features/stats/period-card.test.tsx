import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { metaFixture } from '../../test/fixtures';
import { API, errorBody } from '../../test/handlers';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { PeriodCard } from './period-card';

function card() {
  return screen.getByRole('region', { name: 'Por tempo' });
}

describe('PeriodCard', () => {
  it('sums the world new cases of the last 30 days', async () => {
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    expect(await within(card()).findByText('36.000')).toBeInTheDocument();
    expect(within(card()).getByText('Mundo')).toBeInTheDocument();
    expect(within(card()).getByText('Novos casos nos últimos 30 dias')).toBeInTheDocument();
    expect(within(card()).getByText('De 08/02/2023 a 09/03/2023')).toBeInTheDocument();
    expect(within(card()).queryByText(/Dados a partir de/)).not.toBeInTheDocument();
  });

  it('asks the API for monthly points in the period', async () => {
    let requested: URL | undefined;
    server.use(
      http.get(`${API}/api/v1/global/timeseries`, ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json({
          metric: 'cases',
          granularity: 'month',
          from: '2023-02-08',
          to: '2023-03-09',
          points: [{ date: '2023-02-08', total: 1, new: 1 }],
        });
      }),
    );
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    await within(card()).findByText('Novos casos nos últimos 30 dias');
    expect(requested?.searchParams.get('granularity')).toBe('month');
    expect(requested?.searchParams.get('metric')).toBe('cases');
    expect(requested?.searchParams.get('from')).toBe('2023-02-08');
    expect(requested?.searchParams.get('to')).toBe('2023-03-09');
  });

  it('shows the selected country and the active metric', async () => {
    renderWithProviders(<PeriodCard code="BRA" metric="deaths" period="7d" />);

    expect(await within(card()).findByText('21')).toBeInTheDocument();
    expect(within(card()).getByText('Brasil')).toBeInTheDocument();
    expect(within(card()).getByText('Novas mortes nos últimos 7 dias')).toBeInTheDocument();
    expect(within(card()).getByText('De 03/03/2023 a 09/03/2023')).toBeInTheDocument();
  });

  it('covers the whole history for all', async () => {
    renderWithProviders(<PeriodCard code={null} metric="cases" period="all" />);

    expect(await within(card()).findByText('1.371.600')).toBeInTheDocument();
    expect(within(card()).getByText('Novos casos em todo o período')).toBeInTheDocument();
    expect(within(card()).getByText('De 22/01/2020 a 09/03/2023')).toBeInTheDocument();
  });

  it('starts at the coverage and says so when the period goes before it', async () => {
    server.use(
      http.get(`${API}/api/v1/meta`, () =>
        HttpResponse.json({
          ...metaFixture,
          coverage: { from: '2023-02-20', to: '2023-03-09', countries: 4 },
        }),
      ),
    );
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    expect(await within(card()).findByText('21.600')).toBeInTheDocument();
    expect(within(card()).getByText('De 20/02/2023 a 09/03/2023')).toBeInTheDocument();
    expect(within(card()).getByText('Dados a partir de 20/02/2023')).toBeInTheDocument();
  });

  it('shows the empty state for a country without data', async () => {
    renderWithProviders(<PeriodCard code="ZWE" metric="cases" period="30d" />);

    expect(await within(card()).findByText('Sem dados no período')).toBeInTheDocument();
  });

  it('keeps the skeleton for an unknown country', async () => {
    let answered = false;
    const onResponse = ({ request }: { request: Request }) => {
      if (request.url.includes('/countries/XYZ/timeseries')) answered = true;
    };
    server.events.on('response:mocked', onResponse);
    try {
      renderWithProviders(<PeriodCard code="XYZ" metric="cases" period="30d" />);
      await waitFor(() => expect(answered).toBe(true));
      // Let the query settle on the 404 before asserting.
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      server.events.removeListener('response:mocked', onResponse);
    }

    expect(within(card()).getByRole('status')).toBeInTheDocument();
    expect(within(card()).queryByText('Sem dados no período')).not.toBeInTheDocument();
    expect(within(card()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when no data was loaded yet', async () => {
    server.use(
      http.get(`${API}/api/v1/meta`, () =>
        HttpResponse.json({
          ...metaFixture,
          referenceDate: null,
          coverage: null,
          dataVersion: null,
        }),
      ),
    );
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    expect(await within(card()).findByText('Dados ainda não carregados')).toBeInTheDocument();
  });

  it('treats DATA_NOT_READY from the series as not loaded', async () => {
    server.use(
      http.get(`${API}/api/v1/global/timeseries`, () =>
        HttpResponse.json(errorBody('DATA_NOT_READY', 'no data'), { status: 503 }),
      ),
    );
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    expect(await within(card()).findByText('Dados ainda não carregados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    expect(screen.getByRole('status', { name: 'Carregando novos no período' })).toBeInTheDocument();
  });

  it('shows a local error and retries', async () => {
    server.use(
      http.get(`${API}/api/v1/global/timeseries`, () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
      ),
    );
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os novos no período',
    );
    server.resetHandlers();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await within(card()).findByText('36.000')).toBeInTheDocument();
  });

  it('refetches the meta before the series when retrying a series error', async () => {
    let metaCalls = 0;
    server.use(
      http.get(`${API}/api/v1/meta`, () => {
        metaCalls += 1;
        return HttpResponse.json(metaFixture);
      }),
      http.get(`${API}/api/v1/global/timeseries`, () =>
        HttpResponse.json(errorBody('VALIDATION_ERROR', 'bad range'), { status: 400 }),
      ),
    );
    renderWithProviders(<PeriodCard code={null} metric="cases" period="30d" />);

    await screen.findByRole('alert');
    expect(metaCalls).toBe(1);
    server.resetHandlers();
    server.use(
      http.get(`${API}/api/v1/meta`, () => {
        metaCalls += 1;
        return HttpResponse.json(metaFixture);
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await within(card()).findByText('36.000')).toBeInTheDocument();
    expect(metaCalls).toBe(2);
  });

  it('shows the country name while the series is still loading', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(`${API}/api/v1/countries/:code/timeseries`, async () => {
        await gate;
        return HttpResponse.json(errorBody('INTERNAL_ERROR', 'late'), { status: 500 });
      }),
    );
    renderWithProviders(<PeriodCard code="BRA" metric="cases" period="30d" />);

    expect(await within(card()).findByText('Brasil')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Carregando novos no período' })).toBeInTheDocument();
    release();
  });
});
