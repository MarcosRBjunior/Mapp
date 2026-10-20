import type { FetchLike } from '../../providers/covid-provider.js';
import { ProviderNetworkError } from '../../providers/provider-errors.js';
import {
  BudgetExhaustedError,
  hourAgo,
  isBudgetExhausted,
  monthStartUtc,
  type BudgetLimits,
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
  countSince(since: Date): Promise<number>;
  record(call: CallRecord): Promise<bigint>;
  markInvalidPayload(id: bigint): Promise<void>;
}

export interface CallGateOptions {
  store: ProviderCallStore;
  limits: BudgetLimits;
  fetch: RawFetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
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

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

function endpointOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

export function createCallGate(options: CallGateOptions): CallGate {
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  let lastCallId: bigint | undefined;

  async function assertBudget(): Promise<void> {
    const current = now();
    const counts = {
      lastHour: await options.store.countSince(hourAgo(current)),
      thisMonth: await options.store.countSince(monthStartUtc(current)),
    };
    if (isBudgetExhausted(counts, options.limits)) {
      throw new BudgetExhaustedError(counts, options.limits);
    }
  }

  async function attemptOnce(url: string, headers: Record<string, string>): Promise<Attempt> {
    const started = performance.now();
    let attempt: Attempt;
    try {
      const response = await options.fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      attempt = { kind: 'response', response };
    } catch (error) {
      const kind = isTimeout(error) ? 'timeout' : 'network_error';
      attempt = { kind: 'failure', error: new ProviderNetworkError(kind, { cause: error }) };
    }
    lastCallId = await options.store.record({
      endpoint: endpointOf(url),
      statusCode: attempt.kind === 'response' ? attempt.response.status : null,
      durationMs: Math.round(performance.now() - started),
      outcome:
        attempt.kind === 'failure' ? attempt.error.kind : attempt.response.ok ? 'ok' : 'http_error',
    });
    return attempt;
  }

  const gatedFetch: FetchLike = async (url, init) => {
    for (let attemptNumber = 1; ; attemptNumber += 1) {
      await assertBudget();
      const attempt = await attemptOnce(url, init.headers);
      const retryable = attempt.kind === 'failure' || isRetryableStatus(attempt.response.status);
      if (!retryable || attemptNumber >= MAX_ATTEMPTS) {
        if (attempt.kind === 'failure') {
          throw attempt.error;
        }
        return attempt.response;
      }
      await sleep(RETRY_DELAYS_MS[attemptNumber - 1] ?? RETRY_DELAYS_MS[1]);
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
