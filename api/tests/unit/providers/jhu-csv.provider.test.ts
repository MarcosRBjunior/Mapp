import { describe, expect, it } from 'vitest';
import type { FetchLike, Metric } from '../../../src/providers/covid-provider.js';
import {
  JHU_CSV_BASE_URL,
  createJhuCsvProvider,
  jhuCsvFactory,
} from '../../../src/providers/jhu-csv/jhu-csv.provider.js';
import {
  ProviderAuthError,
  ProviderHttpError,
  ProviderPayloadError,
} from '../../../src/providers/provider-errors.js';
import { fixtureDayRows } from '../../helpers/api-ninjas-fixtures.js';
import { jhuDateLabels, jhuFixtureText, syntheticJhuCsv } from '../../helpers/jhu-csv-fixtures.js';

type Reply = { status: number; body: string };

function provider(reply: (url: string, call: number) => Reply) {
  const requests: string[] = [];
  const fetch: FetchLike = (url) => {
    requests.push(url);
    const { status, body } = reply(url, requests.length);
    return Promise.resolve(new Response(body, { status }));
  };
  return { requests, source: createJhuCsvProvider({ fetch }) };
}

function fixtures() {
  return provider((url) => ({
    status: 200,
    body: jhuFixtureText(url.includes('deaths') ? 'deaths' : 'cases'),
  }));
}

function fromText(body: string) {
  return provider(() => ({ status: 200, body }));
}

describe('JHU CSV provider', () => {
  it('downloads each metric file once per run, whatever the number of calls', async () => {
    const { requests, source } = fixtures();

    await source.fetchDay('2023-03-09', 'cases');
    await source.fetchSeries('Brazil', 'cases');
    await source.fetchSeries('Denmark', 'cases');
    await source.fetchSeries('Brazil', 'deaths');

    expect(requests).toEqual([
      `${JHU_CSV_BASE_URL}/time_series_covid19_confirmed_global.csv`,
      `${JHU_CSV_BASE_URL}/time_series_covid19_deaths_global.csv`,
    ]);
  });

  it.each(['cases', 'deaths'] as const)(
    'gives the same %s on the reference date as the recorded API Ninjas call',
    async (metric: Metric) => {
      const { source } = fixtures();
      const jhu = await source.fetchDay('2023-03-09', metric);
      const key = (row: { country: string; region: string }) => `${row.country}|${row.region}`;
      const shared = new Set(jhu.map(key));

      const ninjas = fixtureDayRows(metric).filter((row) => shared.has(key(row)));

      expect(ninjas).toHaveLength(5);
      expect(jhu.filter((row) => ninjas.some((other) => key(other) === key(row)))).toEqual(
        expect.arrayContaining(ninjas),
      );
    },
  );

  it('returns every region of a country with the whole daily series', async () => {
    const { source } = fixtures();

    const rows = await source.fetchSeries('Denmark', 'cases');

    expect(rows.map((row) => row.region).sort()).toEqual(['', 'Faroe Islands', 'Greenland']);
    for (const row of rows) {
      expect(row.points).toHaveLength(1143);
      expect(row.points[0]?.date).toBe('2020-01-22');
      expect(row.points.at(-1)?.date).toBe('2023-03-09');
    }
  });

  it('matches the country name exactly, including names with commas', async () => {
    const { source } = fixtures();

    expect(await source.fetchSeries('Korea, South', 'cases')).toHaveLength(1);
    expect(await source.fetchSeries('Korea', 'cases')).toEqual([]);
  });

  it('derives new from consecutive totals, keeping negative corrections', async () => {
    const totals = [5, 8, 8, 6, 10];
    const { source } = fromText(
      syntheticJhuCsv([{ country: 'Brazil', total: (day) => totals[day] ?? 10 }]),
    );

    const [row] = await source.fetchSeries('Brazil', 'cases');

    expect(row?.points.slice(0, 6)).toEqual([
      { date: '2020-01-22', total: 5, new: 5 },
      { date: '2020-01-23', total: 8, new: 3 },
      { date: '2020-01-24', total: 8, new: 0 },
      { date: '2020-01-25', total: 6, new: -2 },
      { date: '2020-01-26', total: 10, new: 4 },
      { date: '2020-01-27', total: 10, new: 0 },
    ]);
  });

  it('drops the columns after the final date', async () => {
    const { source } = fromText(
      syntheticJhuCsv([{ country: 'Brazil', total: (day) => day }], jhuDateLabels(1145)),
    );

    const [row] = await source.fetchSeries('Brazil', 'deaths');

    expect(row?.points).toHaveLength(1143);
    expect(row?.points.at(-1)).toEqual({ date: '2023-03-09', total: 1142, new: 1 });
  });

  it('accepts CRLF line endings', async () => {
    const csv = syntheticJhuCsv([{ country: 'Brazil', total: () => 1 }]).replaceAll('\n', '\r\n');
    const { source } = fromText(csv);

    expect(await source.fetchDay('2023-03-09', 'cases')).toEqual([
      { country: 'Brazil', region: '', total: 1, new: 0 },
    ]);
  });

  it('rejects a day outside the series', async () => {
    const { source } = fixtures();

    await expect(source.fetchDay('2023-03-10', 'cases')).rejects.toThrow(ProviderPayloadError);
  });

  const valid = syntheticJhuCsv([{ country: 'Brazil', total: () => 1 }]);
  const [validHeader = '', validRow = ''] = valid.split('\n');

  it.each([
    ['an empty file', ''],
    ['a header without rows', `${validHeader}\n`],
    ['a wrong location header', valid.replace('Province/State', 'State')],
    ['a date that is not M/D/YY', valid.replace(',1/22/20,', ',2020-01-22,')],
    ['a series that does not start on 2020-01-22', syntheticJhuCsv([], jhuDateLabels().slice(1))],
    [
      'a gap between days',
      syntheticJhuCsv(
        [{ country: 'Brazil', total: () => 1 }],
        jhuDateLabels().filter((_, day) => day !== 10),
      ),
    ],
    [
      'a series that stops before 2023-03-09',
      syntheticJhuCsv([{ country: 'Brazil', total: () => 1 }], jhuDateLabels(1142)),
    ],
    ['a negative total', valid.replace(/,1\n$/, ',-1\n')],
    ['a total that is not an integer', valid.replace(/,1\n$/, ',1.5\n')],
    ['an empty total', valid.replace(/,1\n$/, ',\n')],
    ['a short row', valid.replace(/,1\n$/, '\n')],
    ['a row without a country', valid.replace(',Brazil,', ',,')],
    ['the same location twice', `${validHeader}\n${validRow}\n${validRow}\n`],
    ['an unterminated quote', valid.replace(',Brazil,', ',"Brazil,')],
  ])('rejects %s', async (_case, body) => {
    const { source } = fromText(body);

    await expect(source.fetchSeries('Brazil', 'cases')).rejects.toThrow(ProviderPayloadError);
  });

  it('keeps an invalid file instead of downloading it again', async () => {
    const { requests, source } = fromText('not,a,csv\n');

    await expect(source.fetchSeries('Brazil', 'cases')).rejects.toThrow(ProviderPayloadError);
    await expect(source.fetchSeries('Chile', 'cases')).rejects.toThrow(ProviderPayloadError);

    expect(requests).toHaveLength(1);
  });

  it('downloads again after an HTTP error', async () => {
    const { requests, source } = provider((_url, call) =>
      call === 1 ? { status: 503, body: '' } : { status: 200, body: jhuFixtureText('cases') },
    );

    await expect(source.fetchSeries('Brazil', 'cases')).rejects.toThrow(ProviderHttpError);
    expect(await source.fetchSeries('Brazil', 'cases')).toHaveLength(1);

    expect(requests).toHaveLength(2);
  });

  it.each([401, 403])('reports HTTP %i as an auth error', async (status) => {
    const { source } = provider(() => ({ status, body: '' }));

    await expect(source.fetchDay('2023-03-09', 'cases')).rejects.toThrow(ProviderAuthError);
  });

  it('builds a factory for the jhu_csv source that ends on 2023-03-09', () => {
    const factory = jhuCsvFactory();

    expect(factory.sourceCode).toBe('jhu_csv');
    expect(factory.finalDate).toBe('2023-03-09');
  });
});
