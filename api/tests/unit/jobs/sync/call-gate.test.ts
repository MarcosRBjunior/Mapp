import { describe, expect, it } from 'vitest';
import { BudgetExhaustedError } from '../../../../src/jobs/sync/budget.js';
import { LockLostError } from '../../../../src/jobs/sync/lock-lost.js';
import {
  RATE_LIMIT_MESSAGE,
  createCallGate,
  parseRetryAfter,
  type CallRecord,
  type ProviderCallStore,
  type RawFetch,
} from '../../../../src/jobs/sync/call-gate.js';

const URL_CASES = 'https://api.api-ninjas.com/v1/covid19?date=2023-03-09&type=cases';
const HEADERS = { 'X-Api-Key': 'test-key' };
const LIMITS = { perHour: 90, perMonth: 3000 };

interface StoredCall extends CallRecord {
  id: bigint;
  invalid: boolean;
}

function memoryStore(alreadyUsed = 0) {
  const calls: StoredCall[] = [];
  const store: ProviderCallStore = {
    countUsage: () =>
      Promise.resolve({
        lastHour: alreadyUsed + calls.length,
        thisMonth: alreadyUsed + calls.length,
      }),
    record: (call) => {
      const id = BigInt(calls.length + 1);
      calls.push({ ...call, id, invalid: false });
      return Promise.resolve(id);
    },
    markInvalidPayload: (id) => {
      const call = calls.find((stored) => stored.id === id);
      if (call) {
        call.invalid = true;
      }
      return Promise.resolve();
    },
  };
  return { calls, store };
}

function scriptedFetch(...steps: (number | Error | Response)[]) {
  const requests: { url: string; headers: Record<string, string>; signal: AbortSignal }[] = [];
  const fetch: RawFetch = (url, init) => {
    requests.push({ url, ...init });
    const step = steps[requests.length - 1];
    if (step === undefined) {
      return Promise.reject(new Error('unexpected extra request'));
    }
    if (step instanceof Error) {
      return Promise.reject(step);
    }
    if (step instanceof Response) {
      return Promise.resolve(step);
    }
    return Promise.resolve(new Response('[]', { status: step }));
  };
  return { requests, fetch };
}

function recordingSleep() {
  const delays: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    delays.push(ms);
    return Promise.resolve();
  };
  return { delays, sleep };
}

const timeoutError = (): Error =>
  new DOMException('The operation was aborted due to timeout', 'TimeoutError');

const erroringBody = (error: Error): Response =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.error(error);
      },
    }),
    { status: 200 },
  );

describe('createCallGate', () => {
  it('waits the Retry-After seconds on a 429', async () => {
    const { fetch } = scriptedFetch(
      new Response('[]', { status: 429, headers: { 'Retry-After': '5' } }),
      200,
    );
    const { delays, sleep } = recordingSleep();
    const { store } = memoryStore();

    const response = await createCallGate({ store, limits: LIMITS, fetch, sleep }).fetch(
      URL_CASES,
      {
        headers: HEADERS,
      },
    );

    expect(response.status).toBe(200);
    expect(delays).toEqual([5_000]);
  });

  it('stops at once when Retry-After asks for more than a minute', async () => {
    const { requests, fetch } = scriptedFetch(
      new Response('[]', { status: 429, headers: { 'Retry-After': '120' } }),
      200,
    );
    const { delays, sleep } = recordingSleep();
    const { store } = memoryStore();

    await expect(
      createCallGate({ store, limits: LIMITS, fetch, sleep }).fetch(URL_CASES, {
        headers: HEADERS,
      }),
    ).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(requests).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  it('falls back to the default delay for an HTTP-date Retry-After', async () => {
    const { fetch } = scriptedFetch(
      new Response('[]', {
        status: 429,
        headers: { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' },
      }),
      200,
    );
    const { delays, sleep } = recordingSleep();
    const { store } = memoryStore();

    await createCallGate({ store, limits: LIMITS, fetch, sleep }).fetch(URL_CASES, {
      headers: HEADERS,
    });

    expect(delays).toEqual([1_000]);
  });

  it('throws LockLostError when the signal is aborted before an attempt', async () => {
    const { requests, fetch } = scriptedFetch(200);
    const { store } = memoryStore();

    await expect(
      createCallGate({ store, limits: LIMITS, fetch, signal: AbortSignal.abort() }).fetch(
        URL_CASES,
        { headers: HEADERS },
      ),
    ).rejects.toBeInstanceOf(LockLostError);
    expect(requests).toHaveLength(0);
  });

  it('surfaces an abort from the lock signal as LockLostError, not a timeout', async () => {
    const lost = new AbortController();
    const { store } = memoryStore();
    const fetch: RawFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
        lost.abort();
      });

    await expect(
      createCallGate({ store, limits: LIMITS, fetch, signal: lost.signal }).fetch(URL_CASES, {
        headers: HEADERS,
      }),
    ).rejects.toBeInstanceOf(LockLostError);
  });

  it('treats a 429 on the last attempt as an exhausted budget', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(429, 429, 429);

    const failure = createCallGate({
      store,
      limits: LIMITS,
      fetch,
      sleep: recordingSleep().sleep,
    }).fetch(URL_CASES, { headers: HEADERS });

    await expect(failure).rejects.toBeInstanceOf(BudgetExhaustedError);
    await expect(failure).rejects.toThrow(RATE_LIMIT_MESSAGE);
    expect(calls).toHaveLength(3);
  });

  it('retries when the body read times out after the headers', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(erroringBody(timeoutError()), 200);
    const { delays, sleep } = recordingSleep();
    const gate = createCallGate({ store, limits: LIMITS, fetch, sleep });

    const response = await gate.fetch(URL_CASES, { headers: HEADERS });

    expect(response.status).toBe(200);
    expect(calls.map((call) => call.outcome)).toEqual(['timeout', 'ok']);
    expect(delays).toEqual([1000]);
  });

  it('retries when the connection drops while reading the body', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(erroringBody(new TypeError('terminated')), 200);
    const gate = createCallGate({ store, limits: LIMITS, fetch, sleep: recordingSleep().sleep });

    const response = await gate.fetch(URL_CASES, { headers: HEADERS });

    expect(response.status).toBe(200);
    expect(calls.map((call) => call.outcome)).toEqual(['network_error', 'ok']);
  });

  it('returns a successful response and records one call without the key', async () => {
    const { calls, store } = memoryStore();
    const { requests, fetch } = scriptedFetch(200);
    const gate = createCallGate({ store, limits: LIMITS, fetch, sleep: recordingSleep().sleep });

    const response = await gate.fetch(URL_CASES, { headers: HEADERS });

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers).toEqual(HEADERS);
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(calls).toMatchObject([
      { endpoint: '/v1/covid19?date=2023-03-09&type=cases', statusCode: 200, outcome: 'ok' },
    ]);
    expect(calls[0]?.endpoint).not.toContain('test-key');
  });

  it('retries a 429 after 1 s and records both attempts', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(429, 200);
    const { delays, sleep } = recordingSleep();

    const response = await createCallGate({ store, limits: LIMITS, fetch, sleep }).fetch(
      URL_CASES,
      { headers: HEADERS },
    );

    expect(response.status).toBe(200);
    expect(delays).toEqual([1_000]);
    expect(calls.map((call) => [call.statusCode, call.outcome])).toEqual([
      [429, 'http_error'],
      [200, 'ok'],
    ]);
  });

  it('gives up after 3 attempts on 5xx and returns the last response', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(503, 502, 500);
    const { delays, sleep } = recordingSleep();

    const response = await createCallGate({ store, limits: LIMITS, fetch, sleep }).fetch(
      URL_CASES,
      { headers: HEADERS },
    );

    expect(response.status).toBe(500);
    expect(delays).toEqual([1_000, 2_000]);
    expect(calls).toHaveLength(3);
  });

  it('does not retry a 401', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(401);
    const { delays, sleep } = recordingSleep();

    const response = await createCallGate({ store, limits: LIMITS, fetch, sleep }).fetch(
      URL_CASES,
      { headers: HEADERS },
    );

    expect(response.status).toBe(401);
    expect(delays).toEqual([]);
    expect(calls.map((call) => [call.statusCode, call.outcome])).toEqual([[401, 'http_error']]);
  });

  it('records timeouts and throws ProviderNetworkError after 3 attempts', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(timeoutError(), timeoutError(), timeoutError());

    await expect(
      createCallGate({ store, limits: LIMITS, fetch, sleep: recordingSleep().sleep }).fetch(
        URL_CASES,
        { headers: HEADERS },
      ),
    ).rejects.toMatchObject({ name: 'ProviderNetworkError', kind: 'timeout' });
    expect(calls.map((call) => [call.statusCode, call.outcome])).toEqual([
      [null, 'timeout'],
      [null, 'timeout'],
      [null, 'timeout'],
    ]);
  });

  it('retries a network error', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(new TypeError('fetch failed'), 200);

    const response = await createCallGate({
      store,
      limits: LIMITS,
      fetch,
      sleep: recordingSleep().sleep,
    }).fetch(URL_CASES, { headers: HEADERS });

    expect(response.status).toBe(200);
    expect(calls.map((call) => call.outcome)).toEqual(['network_error', 'ok']);
  });

  it('aborts a request that exceeds the timeout', async () => {
    const { calls, store } = memoryStore();
    const fetch: RawFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('timed out', 'TimeoutError'));
        });
      });

    await expect(
      createCallGate({
        store,
        limits: LIMITS,
        fetch,
        sleep: recordingSleep().sleep,
        timeoutMs: 5,
      }).fetch(URL_CASES, { headers: HEADERS }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(calls).toHaveLength(3);
  });

  it('refuses to call when the hourly budget is used up', async () => {
    const { calls, store } = memoryStore(90);
    const { requests, fetch } = scriptedFetch(200);

    await expect(
      createCallGate({ store, limits: LIMITS, fetch }).fetch(URL_CASES, { headers: HEADERS }),
    ).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(requests).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('refuses to call when the monthly budget is used up', async () => {
    const { store } = memoryStore(5);
    const { requests, fetch } = scriptedFetch(200);

    await expect(
      createCallGate({ store, limits: { perHour: 1000, perMonth: 5 }, fetch }).fetch(URL_CASES, {
        headers: HEADERS,
      }),
    ).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(requests).toHaveLength(0);
  });

  it('checks the budget before every retry', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(503, 503, 200);

    await expect(
      createCallGate({
        store,
        limits: { perHour: 2, perMonth: 3000 },
        fetch,
        sleep: recordingSleep().sleep,
      }).fetch(URL_CASES, { headers: HEADERS }),
    ).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(calls).toHaveLength(2);
  });

  it('marks the last call as an invalid payload', async () => {
    const { calls, store } = memoryStore();
    const { fetch } = scriptedFetch(200);
    const gate = createCallGate({ store, limits: LIMITS, fetch });

    await gate.fetch(URL_CASES, { headers: HEADERS });
    await gate.markLastInvalid();

    expect(calls[0]?.invalid).toBe(true);
  });
});

describe('parseRetryAfter', () => {
  it('accepts whole seconds from 1 to 60', () => {
    expect(parseRetryAfter('1')).toBe(1_000);
    expect(parseRetryAfter('60')).toBe(60_000);
  });

  it('rejects anything else', () => {
    for (const value of [
      null,
      '',
      '0',
      '61',
      '1.5',
      '-3',
      'soon',
      'Wed, 21 Oct 2026 07:28:00 GMT',
    ]) {
      expect(parseRetryAfter(value)).toBeNull();
    }
  });
});
