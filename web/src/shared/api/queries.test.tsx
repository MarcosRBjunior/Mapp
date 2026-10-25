import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API } from '../../test/handlers';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { useTimeseries, type SeriesRange } from './queries';
import type { Granularity } from './types';

function Probe({
  code,
  range,
  granularity,
}: {
  code: string | null;
  range: SeriesRange | null;
  granularity: Granularity;
}) {
  const series = useTimeseries(code, 'cases', range, granularity);
  return <output>{series.data ? series.data.points.length : series.fetchStatus}</output>;
}

describe('useTimeseries', () => {
  it('asks the global route for the granularity', async () => {
    let requested: URL | undefined;
    server.use(
      http.get(`${API}/api/v1/global/timeseries`, ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json({
          metric: 'cases',
          granularity: 'day',
          from: '2023-03-08',
          to: '2023-03-09',
          points: [
            { date: '2023-03-08', total: 1, new: 1 },
            { date: '2023-03-09', total: 2, new: 1 },
          ],
        });
      }),
    );
    renderWithProviders(
      <Probe code={null} range={{ from: '2023-03-08', to: '2023-03-09' }} granularity="day" />,
    );

    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(requested?.searchParams.get('granularity')).toBe('day');
    expect(requested?.searchParams.get('from')).toBe('2023-03-08');
    expect(requested?.searchParams.get('to')).toBe('2023-03-09');
  });

  it('returns ISO weeks for a country from the fixtures', async () => {
    renderWithProviders(
      <Probe code="BRA" range={{ from: '2023-02-27', to: '2023-03-09' }} granularity="week" />,
    );

    // 27/02–05/03 and 06/03–09/03
    expect(await screen.findByText('2')).toBeInTheDocument();
  });

  it('stays idle without a range', () => {
    renderWithProviders(<Probe code={null} range={null} granularity="day" />);

    expect(screen.getByText('idle')).toBeInTheDocument();
  });
});
