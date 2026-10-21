import createClient from 'openapi-fetch';
import { getEnv } from '../../config/env';
import type { paths } from './schema';
import type { ApiErrorCode } from './types';

export type ErrorCode = ApiErrorCode | 'NETWORK_ERROR';

const KNOWN_CODES: readonly string[] = [
  'VALIDATION_ERROR',
  'COUNTRY_NOT_FOUND',
  'NOT_FOUND',
  'RATE_LIMITED',
  'DATA_NOT_READY',
  'INTERNAL_ERROR',
] satisfies readonly ApiErrorCode[];

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly requestId: string | null;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    requestId: string | null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function isApiError(error: unknown, code: ErrorCode): boolean {
  return error instanceof ApiError && error.code === code;
}

function createApiClient(baseUrl: string) {
  // Look fetch up on every call so interceptors installed after import (MSW) still apply.
  return createClient<paths>({ baseUrl, fetch: (request: Request) => globalThis.fetch(request) });
}

type ApiClient = ReturnType<typeof createApiClient>;

let client: ApiClient | undefined;

export function apiClient(): ApiClient {
  client ??= createApiClient(getEnv().apiUrl);
  return client;
}

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toApiError(status: number, body: unknown): ApiError {
  if (isRecord(body) && isRecord(body.error)) {
    const { code, message, requestId } = body.error;
    if (typeof code === 'string' && KNOWN_CODES.includes(code) && typeof message === 'string') {
      return new ApiError(
        status,
        code as ApiErrorCode,
        message,
        typeof requestId === 'string' ? requestId : null,
      );
    }
  }
  return new ApiError(
    status,
    'INTERNAL_ERROR',
    `Resposta inesperada da API (HTTP ${status})`,
    null,
  );
}

export async function unwrap<T>(pending: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await pending;
  } catch (cause) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar à API', null, { cause });
  }
  if (result.response.ok && result.data !== undefined) return result.data;
  throw toApiError(result.response.status, result.error);
}
