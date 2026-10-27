import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { addDays } from '../../shared/period/period';
import { API, errorBody } from '../../test/handlers';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { DailyNewChart } from './daily-new-chart';

function chart() {
  return screen.getByRole('region', { name: 'Novos por dia' });
}

function Switcher() {
  const [period, setPeriod] = useState<'30d' | '7d'>('30d');
  return (
    <>
      <button onClick={() => setPeriod('7d')}>trocar</button>
      <DailyNewChart code={null} metric="cases" period={period} />
    </>
  );
}

describe('DailyNewChart', () => {
  it('summarizes the world new cases in the period', async () => {
    renderWithProviders(<DailyNewChart code={null} metric="cases" period="30d" />);

    expect(
      await within(chart()).findByText(
        'Novos casos (Mundo) de 08/02/2023 a 09/03/2023: pico de 1.200 em 08/02/2023; média de 7 dias no último dia: 1.200.',
      ),
    ).toBeInTheDocument();
    expect(within(chart()).getByText('Mundo')).toBeInTheDocument();
  });

  it('finds the peak and averages a negative correction (RN-07)', async () => {
    let requested: URL | undefined;
    server.use(
      http.get(`${API}/api/v1/countries/:code/timeseries`, ({ request }) => {
        requested = new URL(request.url);
        const values: Record<string, number> = { '2023-03-05': 50, '2023-03-08': -14 };
        const points = Array.from({ length: 13 }, (_, index) => {
          const date = addDays('2023-02-25', index);
          return { date, total: 1000 + index, new: values[date] ?? 10 };
        });
        return HttpResponse.json({
          metric: 'cases',
          granularity: 'day',
          from: '2023-02-25',
          to: '2023-03-09',
          country: { code: 'BRA', name: 'Brasil' },
          points,
        });
      }),
    );
    renderWithProviders(<DailyNewChart code="BRA" metric="cases" period="7d" />);

    // 10 + 10 + 50 + 10 + 10 − 14 + 10 = 86; 86 / 7 = 12,3 → 12
    expect(
      await within(chart()).findByText(
        'Novos casos (Brasil) de 03/03/2023 a 09/03/2023: pico de 50 em 05/03/2023; média de 7 dias no último dia: 12.',
      ),
    ).toBeInTheDocument();
    expect(requested?.searchParams.get('from')).toBe('2023-02-25');
    expect(requested?.searchParams.get('granularity')).toBe('day');
  });

  it('shows the empty state for a country without data', async () => {
    renderWithProviders(<DailyNewChart code="ZWE" metric="cases" period="30d" />);

    expect(await within(chart()).findByText('Sem dados no período')).toBeInTheDocument();
  });

  it('keeps the skeleton for an unknown country', async () => {
    let answered = false;
    const onResponse = ({ request }: { request: Request }) => {
      if (request.url.includes('/countries/XYZ/timeseries')) answered = true;
    };
    server.events.on('response:mocked', onResponse);
    try {
      renderWithProviders(<DailyNewChart code="XYZ" metric="cases" period="30d" />);
      await waitFor(() => expect(answered).toBe(true));
      // Let the query settle on the 404 before asserting.
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      server.events.removeListener('response:mocked', onResponse);
    }

    expect(within(chart()).getByRole('status')).toBeInTheDocument();
    expect(within(chart()).queryByText('Sem dados no período')).not.toBeInTheDocument();
    expect(within(chart()).queryByRole('alert')).not.toBeInTheDocument();
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
              from: '2023-03-09',
              to: '2023-03-09',
              points: [{ date: '2023-03-09', total: 5, new: 5 }],
            });
      }),
    );
    renderWithProviders(<DailyNewChart code={null} metric="cases" period="30d" />);

    fireEvent.click(await within(chart()).findByRole('button', { name: 'Tentar de novo' }));
    expect(
      await within(chart()).findByText(
        'Novos casos (Mundo) de 08/02/2023 a 09/03/2023: pico de 5 em 09/03/2023; média de 7 dias no último dia: —.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the previous summary, dimmed, while the next period loads', async () => {
    server.use(
      http.get(`${API}/api/v1/global/timeseries`, async ({ request }) => {
        const from = new URL(request.url).searchParams.get('from');
        if (from === '2023-02-25') await delay(150);
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
      /Novos casos \(Mundo\) de 08\/02\/2023 a 09\/03\/2023/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'trocar' }));

    await waitFor(() => expect(previous.closest('[aria-busy="true"]')).not.toBeNull());
    expect(within(chart()).queryByRole('status')).not.toBeInTheDocument();
    expect(previous).toBeInTheDocument();

    expect(await within(chart()).findByText(/de 03\/03\/2023 a 09\/03\/2023/)).toBeInTheDocument();
    expect(chart().querySelector('[aria-busy="true"]')).toBeNull();
    expect(within(chart()).queryByText(/de 08\/02\/2023 a 09\/03\/2023/)).not.toBeInTheDocument();
  });
});
