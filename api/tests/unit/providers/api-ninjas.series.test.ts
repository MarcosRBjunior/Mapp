import { describe, expect, it } from 'vitest';
import { createApiNinjasProvider } from '../../../src/providers/api-ninjas/api-ninjas.provider.js';
import type { FetchLike } from '../../../src/providers/covid-provider.js';
import {
  ProviderAuthError,
  ProviderHttpError,
  ProviderPayloadError,
} from '../../../src/providers/provider-errors.js';
import { fixtureText } from '../../helpers/api-ninjas-fixtures.js';

function provider(status: number, body: string) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = (url, init) => {
    requests.push({ url, headers: init.headers });
    return Promise.resolve(new Response(body, { status }));
  };
  return { requests, source: createApiNinjasProvider({ apiKey: 'test-key', fetch }) };
}

describe('fetchSeries', () => {
  it('asks for one country and one metric, encoding the name', async () => {
    const { requests, source } = provider(
      200,
      '[{"country":"Korea, South","region":"","cases":{"2023-03-09":{"total":1,"new":0}}}]',
    );

    await source.fetchSeries('Korea, South', 'cases');

    expect(requests).toEqual([
      {
        url: 'https://api.api-ninjas.com/v1/covid19?country=Korea%2C+South&type=cases',
        headers: { 'X-Api-Key': 'test-key' },
      },
    ]);
  });

  it('parses the series in date order and drops dates outside the series', async () => {
    const { source } = provider(200, fixtureText('series/brazil-cases.json'));

    const rows = await source.fetchSeries('Brazil', 'cases');

    expect(rows).toEqual([
      {
        country: 'Brazil',
        region: '',
        points: [
          { date: '2023-03-05', total: 1000, new: 10 },
          { date: '2023-03-06', total: 995, new: -5 },
          { date: '2023-03-07', total: 1010, new: 15 },
          { date: '2023-03-08', total: 1020, new: 10 },
          { date: '2023-03-09', total: 1030, new: 10 },
        ],
      },
    ]);
  });

  it('keeps each region and accepts a metric without points', async () => {
    const regions = await provider(
      200,
      fixtureText('series/australia-cases.json'),
    ).source.fetchSeries('Australia', 'cases');
    expect(regions.map((row) => [row.region, row.points.length])).toEqual([
      ['New South Wales', 2],
      ['Victoria', 1],
    ]);

    const empty = await provider(
      200,
      fixtureText('series/diamond-princess-deaths.json'),
    ).source.fetchSeries('Diamond Princess', 'deaths');
    expect(empty).toEqual([{ country: 'Diamond Princess', region: '', points: [] }]);
  });

  it.each([
    [
      'an invalid date key',
      '[{"country":"Brazil","region":"","cases":{"2023-02-30":{"total":1,"new":0}}}]',
    ],
    [
      'a negative total',
      '[{"country":"Brazil","region":"","cases":{"2023-03-09":{"total":-1,"new":0}}}]',
    ],
    ['an empty list', '[]'],
    ['the wrong metric', '[{"country":"Brazil","region":"","deaths":{}}]'],
    ['invalid JSON', 'not json'],
  ])('rejects %s as a payload error', async (_label, body) => {
    await expect(provider(200, body).source.fetchSeries('Brazil', 'cases')).rejects.toBeInstanceOf(
      ProviderPayloadError,
    );
  });

  it('maps HTTP errors like fetchDay', async () => {
    await expect(provider(401, '{}').source.fetchSeries('Brazil', 'cases')).rejects.toBeInstanceOf(
      ProviderAuthError,
    );
    await expect(provider(502, '').source.fetchSeries('Brazil', 'cases')).rejects.toBeInstanceOf(
      ProviderHttpError,
    );
  });
});
