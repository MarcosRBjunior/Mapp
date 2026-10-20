import { describe, expect, it } from 'vitest';
import {
  API_NINJAS_FINAL_DATE,
  createApiNinjasProvider,
} from '../../../src/providers/api-ninjas/api-ninjas.provider.js';
import type { FetchLike } from '../../../src/providers/covid-provider.js';
import {
  ProviderAuthError,
  ProviderHttpError,
  ProviderPayloadError,
} from '../../../src/providers/provider-errors.js';
import { fixtureText } from '../../helpers/api-ninjas-fixtures.js';

function fakeFetch(status: number, body: string) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = (url, init) => {
    requests.push({ url, headers: init.headers });
    return Promise.resolve(new Response(body, { status }));
  };
  return { requests, fetch };
}

function provider(status: number, body: string) {
  const fake = fakeFetch(status, body);
  return { ...fake, provider: createApiNinjasProvider({ apiKey: 'test-key', fetch: fake.fetch }) };
}

describe('createApiNinjasProvider', () => {
  it('exposes the final date of the series (D-02)', () => {
    const { provider: source } = provider(200, '[]');
    expect(API_NINJAS_FINAL_DATE).toBe('2023-03-09');
    expect(source.finalDate).toBe('2023-03-09');
    expect(source.sourceCode).toBe('api_ninjas');
  });

  it('asks for one day of one metric with the key in the header', async () => {
    const { requests, provider: source } = provider(
      200,
      fixtureText('date-2023-03-09-deaths.json'),
    );
    await source.fetchDay('2023-03-09', 'deaths');
    expect(requests).toEqual([
      {
        url: 'https://api.api-ninjas.com/v1/covid19?date=2023-03-09&type=deaths',
        headers: { 'X-Api-Key': 'test-key' },
      },
    ]);
  });

  it('parses the cases fixture into source rows', async () => {
    const { provider: source } = provider(200, fixtureText('date-2023-03-09-cases.json'));
    const rows = await source.fetchDay('2023-03-09', 'cases');
    expect(rows).toHaveLength(13);
    expect(rows[0]).toEqual({
      country: 'Australia',
      region: 'Australian Capital Territory',
      total: 232974,
      new: 355,
    });
    expect(rows.find((row) => row.country === 'Brazil')).toEqual({
      country: 'Brazil',
      region: '',
      total: 37076053,
      new: 0,
    });
  });

  it('parses the deaths fixture into source rows', async () => {
    const { provider: source } = provider(200, fixtureText('date-2023-03-09-deaths.json'));
    const rows = await source.fetchDay('2023-03-09', 'deaths');
    expect(rows.find((row) => row.country === 'Brazil')).toEqual({
      country: 'Brazil',
      region: '',
      total: 699276,
      new: 0,
    });
  });

  it.each([401, 403])('throws ProviderAuthError on HTTP %i', async (status) => {
    const { provider: source } = provider(status, '{"error":"Invalid API Key."}');
    await expect(source.fetchDay('2023-03-09', 'cases')).rejects.toBeInstanceOf(ProviderAuthError);
  });

  it.each([429, 500])('throws ProviderHttpError on HTTP %i', async (status) => {
    const { provider: source } = provider(status, '');
    await expect(source.fetchDay('2023-03-09', 'cases')).rejects.toMatchObject({
      name: 'ProviderHttpError',
      status,
    });
    await expect(source.fetchDay('2023-03-09', 'cases')).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it.each([
    ['invalid JSON', 'not json'],
    ['a negative total', '[{"country":"Brazil","region":"","cases":{"total":-1,"new":0}}]'],
    ['a non-integer value', '[{"country":"Brazil","region":"","cases":{"total":1.5,"new":0}}]'],
    ['an empty list', '[]'],
    ['the wrong metric key', '[{"country":"Brazil","region":"","deaths":{"total":1,"new":0}}]'],
  ])('throws ProviderPayloadError on %s', async (_label, body) => {
    const { provider: source } = provider(200, body);
    await expect(source.fetchDay('2023-03-09', 'cases')).rejects.toBeInstanceOf(
      ProviderPayloadError,
    );
  });

  it('reports a timeout while reading the body as a network error', async () => {
    const fetch: FetchLike = () =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new DOMException('timed out', 'TimeoutError'));
            },
          }),
          { status: 200 },
        ),
      );
    const source = createApiNinjasProvider({ apiKey: 'test-key', fetch });
    await expect(source.fetchDay('2023-03-09', 'cases')).rejects.toMatchObject({
      name: 'ProviderNetworkError',
      kind: 'timeout',
    });
  });

  it('reports a dropped connection while reading the body as a network error', async () => {
    const fetch: FetchLike = () =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError('terminated'));
            },
          }),
          { status: 200 },
        ),
      );
    const source = createApiNinjasProvider({ apiKey: 'test-key', fetch });
    await expect(source.fetchDay('2023-03-09', 'cases')).rejects.toMatchObject({
      name: 'ProviderNetworkError',
      kind: 'network_error',
    });
  });
});
