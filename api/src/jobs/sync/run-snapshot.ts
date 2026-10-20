import type { Logger } from 'pino';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { CovidProvider, FetchLike, Metric } from '../../providers/covid-provider.js';
import {
  ProviderAuthError,
  ProviderHttpError,
  ProviderNetworkError,
  ProviderPayloadError,
} from '../../providers/provider-errors.js';
import { insertPendingAliases, loadAliases } from '../../repositories/alias.repository.js';
import { upsertDailyStats } from '../../repositories/daily-stat.repository.js';
import { findSourceId } from '../../repositories/data-source.repository.js';
import { refreshGlobalDailyStat } from '../../repositories/global-stat.repository.js';
import { createProviderCallStore } from '../../repositories/provider-call.repository.js';
import {
  completeCheckpoint,
  failCheckpoint,
  finishRun,
  startCheckpoint,
  startRun,
} from '../../repositories/sync-run.repository.js';
import { aggregateDay } from './aggregate.js';
import { BudgetExhaustedError, type BudgetLimits } from './budget.js';
import { createCallGate, type CallGate, type RawFetch } from './call-gate.js';

const METRICS: readonly Metric[] = ['cases', 'deaths'];

export type RunStatus = 'success' | 'partial' | 'failed';

export interface SyncResult {
  runId: number;
  status: RunStatus;
  callsUsed: number;
  pendingNames: string[];
}

export interface SnapshotDeps {
  prisma: PrismaClient;
  createProvider: (fetch: FetchLike) => CovidProvider;
  fetch: RawFetch;
  limits: BudgetLimits;
  logger: Logger;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

// Errors that close one unit; anything else aborts the run.
function isUnitError(error: unknown): boolean {
  return (
    error instanceof ProviderAuthError ||
    error instanceof ProviderHttpError ||
    error instanceof ProviderNetworkError ||
    error instanceof ProviderPayloadError ||
    error instanceof BudgetExhaustedError
  );
}

export async function runSnapshot(deps: SnapshotDeps): Promise<SyncResult> {
  const { prisma } = deps;
  const gateRef: { current?: CallGate } = {};
  const provider = deps.createProvider((url, init) =>
    gateRef.current === undefined
      ? Promise.reject(new Error('call gate is not ready'))
      : gateRef.current.fetch(url, init),
  );
  const sourceId = await findSourceId(prisma, provider.sourceCode);
  if (sourceId === null) {
    throw new Error(`Data source "${provider.sourceCode}" not found: run npm run db:seed -w api`);
  }

  const date = provider.finalDate;
  const runId = await startRun(prisma, { sourceId, mode: 'snapshot', referenceDate: date });
  const activeGate = createCallGate({
    store: createProviderCallStore(prisma, { sourceId, syncRunId: runId }),
    limits: deps.limits,
    fetch: deps.fetch,
    sleep: deps.sleep,
    now: deps.now,
  });
  gateRef.current = activeGate;
  const logger = deps.logger.child({ runId, mode: 'snapshot', referenceDate: date });

  try {
    const pending = new Set<string>();
    const unitErrors: string[] = [];
    let unitsWritten = 0;
    let authFailed = false;

    for (const metric of METRICS) {
      const unit = `snapshot:${metric}:${date}`;
      await startCheckpoint(prisma, runId, unit);
      try {
        const rows = await provider.fetchDay(date, metric);
        const day = aggregateDay(rows, await loadAliases(prisma, sourceId));
        await prisma.$transaction(async (tx) => {
          await insertPendingAliases(tx, sourceId, day.pendingNames);
          await upsertDailyStats(tx, { sourceId, metric, statDate: date, values: day.stats });
          await completeCheckpoint(tx, runId, unit);
        });
        for (const name of day.pendingNames) {
          pending.add(name);
        }
        unitsWritten += 1;
        logger.info(
          {
            unit,
            countries: day.stats.length,
            pendingNames: day.pendingNames,
            ignoredNames: day.ignoredNames,
          },
          'unit done',
        );
      } catch (error) {
        const message = errorMessage(error);
        if (error instanceof ProviderPayloadError) {
          await activeGate.markLastInvalid();
        }
        await failCheckpoint(prisma, runId, unit, message);
        if (!isUnitError(error)) {
          throw error;
        }
        unitErrors.push(`${unit}: ${message}`);
        logger.error({ unit, error: message }, 'unit failed');
        if (error instanceof ProviderAuthError) {
          authFailed = true;
          break;
        }
        if (error instanceof BudgetExhaustedError) {
          break;
        }
      }
    }

    if (unitsWritten > 0) {
      await refreshGlobalDailyStat(prisma);
    }

    const pendingNames = [...pending].sort();
    const notes = [...unitErrors];
    if (pendingNames.length > 0) {
      notes.push(`aliases pendentes: ${pendingNames.join(', ')}`);
    }
    const status: RunStatus =
      authFailed || unitsWritten === 0 ? 'failed' : notes.length > 0 ? 'partial' : 'success';
    const callsUsed = await finishRun(prisma, runId, {
      status,
      error: notes.length > 0 ? notes.join('; ') : null,
    });
    logger.info({ status, callsUsed, pendingNames }, 'snapshot finished');
    return { runId, status, callsUsed, pendingNames };
  } catch (error) {
    await finishRun(prisma, runId, { status: 'failed', error: errorMessage(error) });
    throw error;
  }
}
