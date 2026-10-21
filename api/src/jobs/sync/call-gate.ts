import type { FetchLike } from '../../providers/covid-provider.js';
import { ProviderNetworkError, isTimeoutError } from '../../providers/provider-errors.js';
import { LockLostError } from './lock-lost.js';
import {
  BudgetExhaustedError,
  budgetExhausted,
  isBudgetExhausted,
  type BudgetLimits,
  type CallCounts,
} from './budget.js';

export type RawFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>;

export interface CallRecord {
  endpoint: string;
  statusCode: number | null;
  durationMs: number;
  outcome: 'ok' | 'http_error' | 'timeout' | 'network_error';
}

export interface ProviderCallStore {
  countUsage(): Promise<CallCounts>;
  record(call: CallRecord): Promise<bigint>;
  markInvalidPayload(id: bigint): Promise<void>;
}

export interface CallGateOptions {
  store: ProviderCallStore;
  limits: BudgetLimits;
  fetch: RawFetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  // Aborted when the sync lock is lost: no attempt may start and an in-flight one is cancelled.
  signal?: AbortSignal;
}

export interface CallGate {
  fetch: FetchLike;
  markLastInvalid(): Promise<void>;
}

type Attempt =
  { kind: 'response'; response: Response } | { kind: 'failure'; error: ProviderNetworkError };

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 2_000] as const;
const MAX_RETRY_AFTER_SECONDS = 60;

export const RATE_LIMIT_MESSAGE = 'Provider rate limit reached (HTTP 429)';

// Only whole seconds from 1 to 60 are honoured; anything else falls back to the default delay.
export function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const seconds = Number(value);
  return seconds >= 1 && seconds <= MAX_RETRY_AFTER_SECONDS ? seconds * 1_000 : null;
}

function retryDelay(attempt: Attempt, attemptNumber: number): number {
  const fallback = RETRY_DELAYS_MS[attemptNumber - 1] ?? RETRY_DELAYS_MS[1];
  if (attempt.kind === 'response' && attempt.response.status === 429) {
    return parseRetryAfter(attempt.response.headers.get('Retry-After')) ?? fallback;
  }
  return fallback;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function endpointOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

export function createCallGate(options: CallGateOptions): CallGate {
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  let lastCallId: bigint | undefined;

  async function assertBudget(): Promise<void> {
    const counts = await options.store.countUsage();
    if (isBudgetExhausted(counts, options.limits)) {
      throw budgetExhausted(counts, options.limits);
    }
  }

  async function attemptOnce(url: string, headers: Record<string, string>): Promise<Attempt> {
    const started = performance.now();
    let attempt: Attempt;
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const response = await options.fetch(url, {
        headers,
        signal: options.signal ? AbortSignal.any([timeout, options.signal]) : timeout,
      });
      // Buffer inside the try so a stalled or reset body is recorded and retried like any attempt.
      const body = await response.arrayBuffer();
      attempt = {
        kind: 'response',
        response: new Response(body.byteLength === 0 ? null : body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        }),
      };
    } catch (error) {
      const kind = isTimeoutError(error) ? 'timeout' : 'network_error';
      attempt = { kind: 'failure', error: new ProviderNetworkError(kind, { cause: error }) };
    }
    lastCallId = await options.store.record({
      endpoint: endpointOf(url),
      statusCode: attempt.kind === 'response' ? attempt.response.status : null,
      durationMs: Math.round(performance.now() - started),
      outcome:
        attempt.kind === 'failure' ? attempt.error.kind : attempt.response.ok ? 'ok' : 'http_error',
    });
    // An abort caused by the lock signal is not a source timeout: surface it as such.
    if (options.signal?.aborted && attempt.kind === 'failure') {
      throw new LockLostError();
    }
    return attempt;
  }

  const gatedFetch: FetchLike = async (url, init) => {
    for (let attemptNumber = 1; ; attemptNumber += 1) {
      if (options.signal?.aborted) {
        throw new LockLostError();
      }
      await assertBudget();
      const attempt = await attemptOnce(url, init.headers);
      const retryable = attempt.kind === 'failure' || isRetryableStatus(attempt.response.status);
      if (!retryable || attemptNumber >= MAX_ATTEMPTS) {
        if (attempt.kind === 'failure') {
          throw attempt.error;
        }
        if (attempt.response.status === 429) {
          // The source says its own quota is gone: stop the run instead of burning more calls.
          throw new BudgetExhaustedError(RATE_LIMIT_MESSAGE);
        }
        return attempt.response;
      }
      await sleep(retryDelay(attempt, attemptNumber));
    }
  };

  return {
    fetch: gatedFetch,
    async markLastInvalid() {
      if (lastCallId !== undefined) {
        await options.store.markInvalidPayload(lastCallId);
      }
    },
  };
}
