import type { DataProvider } from '../config/env.js';
import { AppError } from '../lib/app-error.js';
import type { DataStateRepository, SourceRecord } from '../repositories/data-state.repository.js';

export interface DataState {
  sourceId: number;
  dataVersion: number;
  from: string;
  referenceDate: string;
  countries: number;
}

export interface ResolvedDate {
  state: DataState;
  date: string;
}

export interface ResolvedRange {
  state: DataState;
  from: string;
  to: string;
}

export interface DataStateService {
  source(): Promise<SourceRecord>;
  current(): Promise<DataState | null>;
  resolveDate(date: string | undefined): Promise<ResolvedDate>;
  resolveRange(from: string | undefined, to: string | undefined): Promise<ResolvedRange>;
}

// Reads the dataVersion at most once per 5 s per instance; a sync shows up within 5 s.
export const DATA_VERSION_TTL_MS = 5000;

export interface DataStateOptions {
  now?: () => number;
}

export function createDataStateService(
  repo: DataStateRepository,
  sourceCode: DataProvider,
  options: DataStateOptions = {},
): DataStateService {
  let sourcePromise: Promise<SourceRecord> | undefined;
  // Coverage only changes when a sync writes data, i.e. when dataVersion changes.
  let memo: DataState | undefined;

  // The source row never changes at runtime; a failed lookup is retried on the next call.
  function source(): Promise<SourceRecord> {
    if (!sourcePromise) {
      const pending = repo.findSource(sourceCode).then((found) => {
        if (!found) throw new Error(`data source ${sourceCode} is not seeded`);
        return found;
      });
      void pending.catch(() => {
        sourcePromise = undefined;
      });
      sourcePromise = pending;
    }
    return sourcePromise;
  }

  async function load(): Promise<DataState | null> {
    const { id: sourceId } = await source();
    const dataVersion = await repo.findDataVersion(sourceId);
    if (dataVersion === null) return null;
    if (memo?.dataVersion === dataVersion) return memo;

    const coverage = await repo.findCoverage(sourceId);
    if (coverage.from === null || coverage.referenceDate === null) return null;
    memo = {
      sourceId,
      dataVersion,
      from: coverage.from,
      referenceDate: coverage.referenceDate,
      countries: coverage.countries,
    };
    return memo;
  }

  const now = options.now ?? Date.now;
  let recent: { at: number; state: DataState | null } | undefined;

  async function current(): Promise<DataState | null> {
    const at = now();
    if (recent && at - recent.at < DATA_VERSION_TTL_MS) return recent.state;
    const state = await load();
    recent = { at, state };
    return state;
  }

  async function resolveDate(date: string | undefined): Promise<ResolvedDate> {
    const state = await current();
    if (!state) throw new AppError('DATA_NOT_READY', 503, 'no data has been loaded yet');
    if (date === undefined) return { state, date: state.referenceDate };

    const outside =
      date < state.from ||
      date > state.referenceDate ||
      !(await repo.isCompleteDate(state.sourceId, date));
    if (outside) {
      throw new AppError('VALIDATION_ERROR', 400, 'date is outside the data coverage', {
        from: state.from,
        to: state.referenceDate,
      });
    }
    return { state, date };
  }

  async function resolveRange(
    from: string | undefined,
    to: string | undefined,
  ): Promise<ResolvedRange> {
    const state = await current();
    if (!state) throw new AppError('DATA_NOT_READY', 503, 'no data has been loaded yet');
    const range = { from: from ?? state.from, to: to ?? state.referenceDate };
    const outside = (date: string) => date < state.from || date > state.referenceDate;
    if (outside(range.from) || outside(range.to)) {
      throw new AppError('VALIDATION_ERROR', 400, 'date is outside the data coverage', {
        from: state.from,
        to: state.referenceDate,
      });
    }
    if (range.from > range.to) {
      throw new AppError('VALIDATION_ERROR', 400, 'from must not be after to', range);
    }
    return { state, ...range };
  }

  return { source, current, resolveDate, resolveRange };
}
