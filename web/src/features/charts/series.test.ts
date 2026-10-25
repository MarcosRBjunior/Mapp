import { describe, expect, it } from 'vitest';
import type { TimeseriesPoint } from '../../shared/api/types';
import { addDays } from '../../shared/period/period';
import {
  chartRanges,
  cumulativeRows,
  cumulativeSummary,
  dailyNewRows,
  dailyNewSummary,
  scaled,
  seriesEnds,
} from './series';

// Consecutive days from `from`, with `values` as `new` and a running `total`.
function daily(from: string, values: number[]): TimeseriesPoint[] {
  let total = 0;
  return values.map((value, index) => {
    total += value;
    return { date: addDays(from, index), total, new: value };
  });
}

const COVERAGE = { from: '2020-01-22', to: '2023-03-09' };

describe('chartRanges', () => {
  it('fetches 6 days before the visible range for the 7-day average', () => {
    expect(chartRanges('30d', COVERAGE)).toEqual({
      visible: { from: '2023-02-08', to: '2023-03-09', clamped: false },
      fetch: { from: '2023-02-02', to: '2023-03-09' },
    });
  });

  it('never fetches before the coverage', () => {
    expect(chartRanges('7d', { from: '2023-03-01', to: '2023-03-09' })).toEqual({
      visible: { from: '2023-03-03', to: '2023-03-09', clamped: false },
      fetch: { from: '2023-03-01', to: '2023-03-09' },
    });
  });

  it('keeps the clamp of the visible range', () => {
    expect(chartRanges('30d', { from: '2023-03-01', to: '2023-03-09' })).toEqual({
      visible: { from: '2023-03-01', to: '2023-03-09', clamped: true },
      fetch: { from: '2023-03-01', to: '2023-03-09' },
    });
  });
});

describe('dailyNewRows', () => {
  it('averages the day and the 6 before it, only from the visible start', () => {
    const rows = dailyNewRows(daily('2023-03-01', [1, 2, 3, 4, 5, 6, 7, 8, 9]), '2023-03-03');

    expect(rows.map((row) => row.date)).toEqual([
      '2023-03-03',
      '2023-03-04',
      '2023-03-05',
      '2023-03-06',
      '2023-03-07',
      '2023-03-08',
      '2023-03-09',
    ]);
    expect(rows[0]).toEqual({ date: '2023-03-03', value: 3, bar: 3, average: null });
    expect(rows[4]).toEqual({ date: '2023-03-07', value: 7, bar: 7, average: 4 });
    expect(rows[6]).toEqual({ date: '2023-03-09', value: 9, bar: 9, average: 6 });
  });

  it('keeps a negative value but never draws it (RN-07)', () => {
    const rows = dailyNewRows(daily('2023-03-01', [10, 10, 10, 10, 10, -14, 10]), '2023-03-01');

    expect(rows[5]).toEqual({ date: '2023-03-06', value: -14, bar: 0, average: null });
    // (6 × 10 − 14) / 7 = 6,57 → 7
    expect(rows[6]?.average).toBe(7);
  });

  it('draws a negative average as zero', () => {
    const rows = dailyNewRows(daily('2023-03-01', [-7, -7, -7, -7, -7, -7, -7]), '2023-03-01');

    expect(rows[6]).toEqual({ date: '2023-03-07', value: -7, bar: 0, average: 0 });
  });

  it('leaves the average empty when a day of the window is missing', () => {
    const points = daily('2023-03-01', [1, 1, 1, 1, 1, 1, 1, 1]).filter(
      (point) => point.date !== '2023-03-04',
    );

    expect(dailyNewRows(points, '2023-03-01').at(-1)).toEqual({
      date: '2023-03-08',
      value: 1,
      bar: 1,
      average: null,
    });
  });
});

describe('scaled', () => {
  it('turns zero and negatives into gaps on the log scale', () => {
    expect(scaled(0, 'log')).toBeNull();
    expect(scaled(-3, 'log')).toBeNull();
    expect(scaled(5, 'log')).toBe(5);
    expect(scaled(0, 'linear')).toBe(0);
    expect(scaled(undefined, 'linear')).toBeNull();
  });
});

describe('cumulativeRows', () => {
  const world: TimeseriesPoint[] = [
    { date: '2023-03-01', total: 10, new: 10 },
    { date: '2023-03-02', total: 20, new: 10 },
    { date: '2023-03-03', total: 30, new: 10 },
  ];
  const country: TimeseriesPoint[] = [
    { date: '2023-03-02', total: 0, new: 0 },
    { date: '2023-03-03', total: 5, new: 5 },
  ];

  it('joins the country to the world dates', () => {
    expect(cumulativeRows(world, country, 'linear')).toEqual([
      { date: '2023-03-01', world: 10, country: null },
      { date: '2023-03-02', world: 20, country: 0 },
      { date: '2023-03-03', world: 30, country: 5 },
    ]);
  });

  it('drops zeros on the log scale', () => {
    expect(cumulativeRows(world, country, 'log')[1]).toEqual({
      date: '2023-03-02',
      world: 20,
      country: null,
    });
  });

  it('has no country without a selection', () => {
    expect(cumulativeRows(world, null, 'linear').map((row) => row.country)).toEqual([
      null,
      null,
      null,
    ]);
  });
});

describe('seriesEnds', () => {
  it('takes the first and last totals', () => {
    expect(seriesEnds('Brasil', daily('2023-03-01', [1, 2, 3]))).toEqual({
      name: 'Brasil',
      first: 1,
      last: 6,
    });
    expect(seriesEnds('Brasil', [])).toBeNull();
  });
});

describe('summaries', () => {
  const range = { from: '2023-02-08', to: '2023-03-09' };

  it('describes the cumulative growth of each series', () => {
    expect(
      cumulativeSummary('cases', range, [
        { name: 'Brasil', first: 133680, last: 137160 },
        { name: 'Mundo', first: 1336800, last: 1371600 },
      ]),
    ).toBe(
      'Casos acumulados de 08/02/2023 a 09/03/2023 — Brasil: de 133.680 para 137.160; Mundo: de 1.336.800 para 1.371.600.',
    );
    expect(cumulativeSummary('deaths', range, [{ name: 'Mundo', first: 1, last: 2 }])).toBe(
      'Mortes acumuladas de 08/02/2023 a 09/03/2023 — Mundo: de 1 para 2.',
    );
  });

  it('describes the peak and the last 7-day average', () => {
    const rows = dailyNewRows(
      daily('2023-03-01', [10, 10, 50, 10, 10, -14, 10, 50, 10]),
      '2023-03-01',
    );

    expect(dailyNewSummary('cases', 'Brasil', { from: '2023-03-01', to: '2023-03-09' }, rows)).toBe(
      'Novos casos (Brasil) de 01/03/2023 a 09/03/2023: pico de 50 em 03/03/2023; média de 7 dias no último dia: 18.',
    );
  });

  it('shows a dash while the average is still empty', () => {
    const rows = dailyNewRows(daily('2023-03-01', [4, 2]), '2023-03-01');

    expect(dailyNewSummary('deaths', 'Mundo', { from: '2023-03-01', to: '2023-03-02' }, rows)).toBe(
      'Novas mortes (Mundo) de 01/03/2023 a 02/03/2023: pico de 4 em 01/03/2023; média de 7 dias no último dia: —.',
    );
    expect(dailyNewSummary('cases', 'Mundo', range, [])).toBe('');
  });
});
