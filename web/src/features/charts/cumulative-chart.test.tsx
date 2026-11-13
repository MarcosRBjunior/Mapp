import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { metaFixture } from '../../test/fixtures';
import { API, errorBody } from '../../test/handlers';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { waitForFailedQueries } from '../../test/settle';
import { CumulativeChart } from './cumulative-chart';

function chart() {
  return screen.getByRole('region', { name: 'Crescimento acumulado' });
}

function Switcher({ code = null }: { code?: string | null }) {
  const [period, setPeriod] = useState<'30d' | '7d'>('30d');
  return (
    <>
      <button onClick={() => setPeriod('7d')}>trocar</button>
      <CumulativeChart code={code} metric="cases" period={period} />
    </>
  );
}

describe('CumulativeChart', () => {
  it('summarizes the world growth in the period', async () => {
    renderWithProviders(<CumulativeChart code={null} metric="cases" period="30d" />);

    expect(
      await within(chart()).findByText(
        'Casos acumulados de 08/02/2023 a 09/03/2023 — Mundo: de 1.336.800 para 1.371.600.',
      ),
    ).toBeInTheDocument();
  });

  it('compares the country with the world', async () => {
    renderWithProviders(<CumulativeChart code="BRA" metric="deaths" period="7d" />);

    expect(
      await within(chart()).findByText(
        'Mortes acumuladas de 03/03/2023 a 09/03/2023 — Brasil: de 3.411 para 3.429; Mundo: de 22.740 para 22.860.',
      ),
    ).toBeInTheDocument();
    expect(within(chart()).getByText('Brasil × Mundo')).toBeInTheDocument();
  });

  it('shows the country name while its detail is loading', async () => {
    server.use(http.get(`${API}/api/v1/countries/BRA`, () => delay('infinite')));
    renderWithProviders(<CumulativeChart code="BRA" metric="deaths" period="7d" />);

    expect(await within(chart()).findByText(/— Brasil: de 3\.411/)).toBeInTheDocument();
  });

  it('asks for daily points from 6 days before the period', async () => {
    let requested: URL | undefined;
    server.use(
      http.get(`${API}/api/v1/global/timeseries`, ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json({
          metric: 'cases',
          granularity: 'day',
          from: '2023-02-02',
          to: '2023-03-09',
          points: [{ date: '2023-03-09', total: 5, new: 1 }],
        });
      }),
    );
    renderWithProviders(<CumulativeChart code={null} metric="cases" period="30d" />);

    await within(chart()).findByText(/Casos acumulados de 08\/02\/2023/);
    expect(requested?.searchParams.get('granularity')).toBe('day');
    expect(requested?.searchParams.get('from')).toBe('2023-02-02');
    expect(requested?.searchParams.get('to')).toBe('2023-03-09');
  });

  it('warns when the period starts before the coverage', async () => {
    server.use(
      http.get(`${API}/api/v1/meta`, () =>
        HttpResponse.json({
          ...metaFixture,
          coverage: { ...metaFixture.coverage, from: '2023-03-01' },
        }),
      ),
    );
    renderWithProviders(<CumulativeChart code={null} metric="cases" period="30d" />);

    expect(await within(chart()).findByText('Dados a partir de 01/03/2023')).toBeInTheDocument();
  });

  it('switches between the linear and log scales', async () => {
    renderWithProviders(<CumulativeChart code={null} metric="cases" period="30d" />);

    const log = await within(chart()).findByRole('radio', { name: 'Log' });
    expect(within(chart()).getByRole('radio', { name: 'Linear' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(log);
    expect(log).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the empty state for a country without data', async () => {
    renderWithProviders(<CumulativeChart code="ZWE" metric="cases" period="30d" />);

    expect(await within(chart()).findByText('Sem dados no período')).toBeInTheDocument();
  });

  it('keeps the skeleton for an unknown country', async () => {
    const { queryClient } = renderWithProviders(
      <CumulativeChart code="XYZ" metric="cases" period="30d" />,
    );
    // The series and the detail of XYZ both settle on COUNTRY_NOT_FOUND.
    await waitForFailedQueries(queryClient, 2);

    expect(within(chart()).getByRole('status')).toBeInTheDocument();
    expect(within(chart()).queryByText('Sem dados no período')).not.toBeInTheDocument();
    expect(within(chart()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error when the series is 404 but the detail failed with 5xx', async () => {
    server.use(
      http.get(`${API}/api/v1/countries/XYZ`, () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
      ),
    );
    renderWithProviders(<CumulativeChart code="XYZ" metric="cases" period="30d" />);

    expect(await within(chart()).findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o crescimento acumulado',
    );
  });

  it('says the data is not loaded on DATA_NOT_READY', async () => {
    server.use(
      http.get(`${API}/api/v1/global/timeseries`, () =>
        HttpResponse.json(errorBody('DATA_NOT_READY', 'no data'), { status: 503 }),
      ),
    );
    renderWithProviders(<CumulativeChart code={null} metric="cases" period="30d" />);

    expect(await within(chart()).findByText('Dados ainda não carregados')).toBeInTheDocument();
  });

  it('retries only the failed series, not the world series that loaded', async () => {
    let worldCalls = 0;
    let countryCalls = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/global/timeseries')) worldCalls += 1;
    });
    server.use(
      http.get(`${API}/api/v1/countries/BRA/timeseries`, () => {
        countryCalls += 1;
        return HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 });
      }),
    );
    try {
      renderWithProviders(<CumulativeChart code="BRA" metric="cases" period="30d" />);
      fireEvent.click(await within(chart()).findByRole('button', { name: 'Tentar de novo' }));
      await waitFor(() => expect(countryCalls).toBe(2));
      await within(chart()).findByRole('button', { name: 'Tentar de novo' });
    } finally {
      server.events.removeAllListeners('request:start');
    }

    expect(worldCalls).toBe(1);
  });

  it('retries after an error', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/api/v1/global/timeseries`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 })
          : HttpResponse.json({
              metric: 'cases',
              granularity: 'day',
              from: '2023-02-02',
              to: '2023-03-09',
              points: [
                { date: '2023-03-08', total: 4, new: 1 },
                { date: '2023-03-09', total: 5, new: 1 },
              ],
            });
      }),
    );
    renderWithProviders(<CumulativeChart code={null} metric="cases" period="30d" />);

    fireEvent.click(await within(chart()).findByRole('button', { name: 'Tentar de novo' }));
    expect(
      await within(chart()).findByText(
        'Casos acumulados de 08/02/2023 a 09/03/2023 — Mundo: de 4 para 5.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the previous summary, dimmed, while the next period loads', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(`${API}/api/v1/global/timeseries`, async ({ request }) => {
        const from = new URL(request.url).searchParams.get('from');
        if (from === '2023-02-25') await gate;
        return HttpResponse.json({
          metric: 'cases',
          granularity: 'day',
          from: from ?? '',
          to: '2023-03-09',
          points: [
            { date: '2023-03-03', total: 3, new: 1 },
            { date: '2023-03-09', total: 9, new: 2 },
          ],
        });
      }),
    );
    renderWithProviders(<Switcher />);

    const previous = await within(chart()).findByText(
      /Casos acumulados de 08\/02\/2023 a 09\/03\/2023/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'trocar' }));

    await waitFor(() => expect(previous.closest('[aria-busy="true"]')).not.toBeNull());
    expect(within(chart()).queryByRole('status')).not.toBeInTheDocument();
    expect(previous).toBeInTheDocument();
    release();

    expect(await within(chart()).findByText(/de 03\/03\/2023 a 09\/03\/2023/)).toBeInTheDocument();
    expect(chart().querySelector('[aria-busy="true"]')).toBeNull();
    expect(within(chart()).queryByText(/de 08\/02\/2023 a 09\/03\/2023/)).not.toBeInTheDocument();
  });
  it('never pairs the new world period with the old country points', async () => {
    const body = (from: string, total: number) => ({
      metric: 'cases',
      granularity: 'day',
      from,
      to: '2023-03-09',
      points: [
        { date: '2023-03-03', total, new: 1 },
        { date: '2023-03-09', total: total + 1, new: 1 },
      ],
    });
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(`${API}/api/v1/global/timeseries`, ({ request }) =>
        HttpResponse.json(body(new URL(request.url).searchParams.get('from') ?? '', 100)),
      ),
      http.get(`${API}/api/v1/countries/BRA/timeseries`, async ({ request }) => {
        const from = new URL(request.url).searchParams.get('from') ?? '';
        if (from === '2023-02-25') await gate;
        return HttpResponse.json(body(from, 10));
      }),
    );
    renderWithProviders(<Switcher code="BRA" />);

    await within(chart()).findByText(/de 08\/02\/2023 a 09\/03\/2023/);
    fireEvent.click(screen.getByRole('button', { name: 'trocar' }));

    await within(chart()).findByRole('status');
    expect(within(chart()).queryByText(/Casos acumulados/)).not.toBeInTheDocument();
    release();

    expect(
      await within(chart()).findByText(
        /de 03\/03\/2023 a 09\/03\/2023 — Brasil: de 10 para 11; Mundo: de 100 para 101/,
      ),
    ).toBeInTheDocument();
  });
});
