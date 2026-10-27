import { fireEvent, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API, errorBody } from '../../test/handlers';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { CountrySparkline } from './country-sparkline';

describe('CountrySparkline', () => {
  afterEach(() => server.events.removeAllListeners());

  it('summarizes the whole history by week', async () => {
    let requested: URL | undefined;
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/timeseries')) requested = new URL(request.url);
    });
    renderWithProviders(<CountrySparkline code="BRA" name="Brasil" metric="cases" />);

    // First ISO week cut at 22/01/2020: 5 days × 120.
    expect(
      await screen.findByText(
        'Casos acumulados de 22/01/2020 a 09/03/2023 — Brasil: de 600 para 137.160.',
      ),
    ).toBeInTheDocument();
    expect(requested?.searchParams.get('granularity')).toBe('week');
    expect(requested?.searchParams.get('from')).toBe('2020-01-22');
    expect(requested?.searchParams.get('to')).toBe('2023-03-09');
  });

  it('tells the popup to re-layout once the series loads', async () => {
    const onLayoutChange = vi.fn();
    renderWithProviders(
      <CountrySparkline code="BRA" name="Brasil" metric="cases" onLayoutChange={onLayoutChange} />,
    );

    await screen.findByText(/Casos acumulados de 22\/01\/2020/);
    expect(onLayoutChange).toHaveBeenCalled();
  });

  it('shows the empty state for a country without data', async () => {
    renderWithProviders(<CountrySparkline code="ZWE" name="Zimbábue" metric="cases" />);

    expect(await screen.findByText('Sem dados no período')).toBeInTheDocument();
  });

  it('retries after an error', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/api/v1/countries/:code/timeseries`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 })
          : HttpResponse.json({
              metric: 'deaths',
              granularity: 'week',
              from: '2020-01-22',
              to: '2023-03-09',
              country: { code: 'BRA', name: 'Brasil' },
              points: [
                { date: '2020-01-22', total: 1, new: 1 },
                { date: '2023-03-06', total: 9, new: 1 },
              ],
            });
      }),
    );
    renderWithProviders(<CountrySparkline code="BRA" name="Brasil" metric="deaths" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(
      await screen.findByText(
        'Mortes acumuladas de 22/01/2020 a 09/03/2023 — Brasil: de 1 para 9.',
      ),
    ).toBeInTheDocument();
  });
});
