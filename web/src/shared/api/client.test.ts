import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API } from '../../test/handlers';
import { server } from '../../test/server';
import { ApiError, apiClient, isApiError, unwrap } from './client';

describe('unwrap', () => {
  it('returns the data of a successful response', async () => {
    const meta = await unwrap(apiClient().GET('/api/v1/meta'));

    expect(meta.referenceDate).toBe('2023-03-09');
  });

  it('turns the error envelope into an ApiError', async () => {
    const error: unknown = await unwrap(
      apiClient().GET('/api/v1/countries/{code}', { params: { path: { code: 'XYZ' } } }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'COUNTRY_NOT_FOUND', requestId: 'req-test' });
    expect(isApiError(error, 'COUNTRY_NOT_FOUND')).toBe(true);
    expect(isApiError(error, 'DATA_NOT_READY')).toBe(false);
  });

  it('falls back to INTERNAL_ERROR when the body has no envelope', async () => {
    server.use(http.get(`${API}/api/v1/meta`, () => HttpResponse.text('boom', { status: 502 })));

    await expect(unwrap(apiClient().GET('/api/v1/meta'))).rejects.toMatchObject({
      status: 502,
      code: 'INTERNAL_ERROR',
      requestId: null,
    });
  });

  it('maps a network failure to NETWORK_ERROR', async () => {
    server.use(http.get(`${API}/api/v1/meta`, () => HttpResponse.error()));

    await expect(unwrap(apiClient().GET('/api/v1/meta'))).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });
});
