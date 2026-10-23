import type { Logger } from 'pino';
import type { PrismaClient, SyncMode } from '../../generated/prisma/client.js';
import type { CovidProvider, ProviderFactory } from '../../providers/covid-provider.js';
import {
  ProviderAuthError,
  ProviderHttpError,
  ProviderNetworkError,
  ProviderPayloadError,
} from '../../providers/provider-errors.js';
import { loadAliases } from '../../repositories/alias.repository.js';
import { findSourceId } from '../../repositories/data-source.repository.js';
import { refreshGlobalDailyStat } from '../../repositories/global-stat.repository.js';
import { createProviderCallStore } from '../../repositories/provider-call.repository.js';
import {
  failCheckpoint,
  finishRun,
  startCheckpoint,
  startRun,
} from '../../repositories/sync-run.repository.js';
import { writeUnit, type UnitRows } from '../../repositories/sync-unit.repository.js';
import type { AliasEntry } from './aggregate.js';
import { bestEffort } from './best-effort.js';
import { BudgetExhaustedError, type BudgetLimits } from './budget.js';
import { LockLostError } from './lock-lost.js';
import { createCallGate, type RawFetch } from './call-gate.js';

export type RunStatus = 'success' | 'partial' | 'failed';

export const MAX_CONSECUTIVE_SOURCE_FAILURES = 3;
export const SOURCE_UNSTABLE_NOTE = `fonte instável: ${MAX_CONSECUTIVE_SOURCE_FAILURES} unidades seguidas falharam por rede/5xx, o run parou`;

export const LOCK_LOST_NOTE = 'lock perdido: a conexão do lock caiu, o run parou';

export interface UnitContext {
  provider: CovidProvider;
  aliases: ReadonlyMap<string, AliasEntry>;
}

export interface UnitOutput {
  rows: UnitRows;
  pendingNames: string[];
  ignoredNames: string[];
}

export interface UnitPlan {
  unit: string;
  load(context: UnitContext): Promise<UnitOutput>;
}

export interface PlanContext {
  prisma: PrismaClient;
  sourceId: number;
  aliases: ReadonlyMap<string, AliasEntry>;
}

export interface RunPlan {
  mode: SyncMode;
  referenceDate: string;
  planUnits(context: PlanContext): Promise<{ units: UnitPlan[]; alreadyDone: number }>;
}

export interface RunUnitsDeps {
  prisma: PrismaClient;
  source: ProviderFactory;
  fetch: RawFetch;
  limits: BudgetLimits;
  logger: Logger;
  sleep?: (ms: number) => Promise<void>;
  // Aborted when the sync lock is lost: no new unit may start.
  signal?: AbortSignal;
}

export interface SyncResult {
  runId: number | null;
  status: RunStatus;
  callsUsed: number;
  pendingNames: string[];
  unitsPlanned: number;
  unitsDone: number;
  unitsRemaining: number;
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

// failed only when nothing was written, so every run that writes data changes the dataVersion.
export function decideStatus(input: {
  planned: number;
  completed: number;
  wroteRows: boolean;
  hasNotes: boolean;
}): RunStatus {
  if (!input.wroteRows) return 'failed';
  return input.hasNotes || input.completed < input.planned ? 'partial' : 'success';
}

export async function runUnits(deps: RunUnitsDeps, plan: RunPlan): Promise<SyncResult> {
  const { prisma, source } = deps;
  const sourceId = await findSourceId(prisma, source.sourceCode);
  if (sourceId === null) {
    throw new Error(`Data source "${source.sourceCode}" not found: run npm run db:seed -w api`);
  }
  const aliases = await loadAliases(prisma, sourceId);
  const { units, alreadyDone } = await plan.planUnits({ prisma, sourceId, aliases });

  // Nothing left (a finished full load): no run, so the dataVersion and the ETag stay.
  if (units.length === 0) {
    deps.logger.info({ mode: plan.mode, unitsDone: alreadyDone }, 'nothing to do');
    return {
      runId: null,
      status: 'success',
      callsUsed: 0,
      pendingNames: [],
      unitsPlanned: alreadyDone,
      unitsDone: alreadyDone,
      unitsRemaining: 0,
    };
  }

  const runId = await startRun(prisma, {
    sourceId,
    mode: plan.mode,
    referenceDate: plan.referenceDate,
  });
  const logger = deps.logger.child({ runId, mode: plan.mode });

  const pending = new Set<string>();
  const notes: string[] = [];
  let completed = 0;
  let wroteRows = false;
  let consecutiveSourceFailures = 0;
  const result = (status: RunStatus, callsUsed: number): SyncResult => ({
    runId,
    status,
    callsUsed,
    pendingNames: [...pending].sort(),
    unitsPlanned: alreadyDone + units.length,
    unitsDone: alreadyDone + completed,
    unitsRemaining: units.length - completed,
  });

  try {
    const gate = createCallGate({
      store: createProviderCallStore(prisma, { sourceId, syncRunId: runId }),
      limits: deps.limits,
      fetch: deps.fetch,
      signal: deps.signal,
      sleep: deps.sleep,
    });
    const provider = source.create(gate.fetch);
    for (const unit of units) {
      if (deps.signal?.aborted) {
        notes.push(LOCK_LOST_NOTE);
        logger.error('sync lock lost, stopping');
        break;
      }
      await startCheckpoint(prisma, runId, unit.unit);
      try {
        const output = await unit.load({ provider, aliases });
        if (deps.signal?.aborted) {
          throw new LockLostError();
        }
        const written = await writeUnit(prisma, {
          sourceId,
          runId,
          unit: unit.unit,
          pendingNames: output.pendingNames,
          rows: output.rows,
        });
        completed += 1;
        consecutiveSourceFailures = 0;
        wroteRows ||= written > 0;
        for (const name of output.pendingNames) {
          pending.add(name);
        }
        logger.info(
          {
            unit: unit.unit,
            rows: written,
            pendingNames: output.pendingNames,
            ignoredNames: output.ignoredNames,
          },
          'unit done',
        );
      } catch (error) {
        const message = errorMessage(error);
        if (error instanceof ProviderPayloadError) {
          await bestEffort(logger, 'mark invalid payload', () => gate.markLastInvalid());
        }
        await bestEffort(logger, 'fail checkpoint', () =>
          failCheckpoint(prisma, runId, unit.unit, message),
        );
        if (error instanceof LockLostError) {
          if (!notes.includes(LOCK_LOST_NOTE)) {
            notes.push(LOCK_LOST_NOTE);
          }
          logger.error('sync lock lost, stopping');
          break;
        }
        if (!isUnitError(error)) {
          throw error;
        }
        notes.push(`${unit.unit}: ${message}`);
        logger.error({ unit: unit.unit, error: message }, 'unit failed');
        if (error instanceof ProviderAuthError || error instanceof BudgetExhaustedError) {
          break;
        }
        if (error instanceof ProviderNetworkError || error instanceof ProviderHttpError) {
          consecutiveSourceFailures += 1;
        } else {
          consecutiveSourceFailures = 0;
        }
        if (consecutiveSourceFailures >= MAX_CONSECUTIVE_SOURCE_FAILURES) {
          notes.push(SOURCE_UNSTABLE_NOTE);
          logger.error('source unstable, stopping');
          break;
        }
      }
    }

    if (deps.signal?.aborted && !notes.includes(LOCK_LOST_NOTE)) {
      notes.push(LOCK_LOST_NOTE);
      logger.error('sync lock lost, stopping');
    }
    if (wroteRows) {
      await refreshGlobalDailyStat(prisma);
    }
    if (pending.size > 0) {
      notes.push(`aliases pendentes: ${[...pending].sort().join(', ')}`);
    }
    const status = decideStatus({
      planned: units.length,
      completed,
      wroteRows,
      hasNotes: notes.length > 0,
    });
    const callsUsed = await finishRun(prisma, runId, {
      status,
      error: notes.length > 0 ? notes.join('; ') : null,
    });
    const summary = result(status, callsUsed);
    logger.info(summary, 'run finished');
    return summary;
  } catch (error) {
    // Unexpected failure: keep the view in step with what was written, close the run, rethrow.
    if (wroteRows) {
      await bestEffort(logger, 'refresh global view', () => refreshGlobalDailyStat(prisma));
    }
    await bestEffort(logger, 'finish run', () =>
      finishRun(prisma, runId, {
        status: wroteRows ? 'partial' : 'failed',
        error: errorMessage(error),
      }),
    );
    throw error;
  }
}
