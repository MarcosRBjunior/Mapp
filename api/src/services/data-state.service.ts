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

export interface DataStateService {
  source(): Promise<SourceRecord>;
  current(): Promise<DataState | null>;
  resolveDate(date: string | undefined): Promise<ResolvedDate>;
}

export function createDataStateService(
  repo: DataStateRepository,
  sourceCode: DataProvider,
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

  async function current(): Promise<DataState | null> {
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

  async function resolveDate(date: string | undefined): Promise<ResolvedDate> {
    const state = await current();
    if (!state) throw new AppError('DATA_NOT_READY', 503, 'no data has been loaded yet');
    if (date === undefined) return { state, date: state.referenceDate };

    const outside =
      date < state.from ||
      date > state.referenceDate ||
      !(await repo.hasGlobalDate(state.sourceId, date));
    if (outside) {
      throw new AppError('VALIDATION_ERROR', 400, 'date is outside the data coverage', {
        from: state.from,
        to: state.referenceDate,
      });
    }
    return { state, date };
  }

  return { source, current, resolveDate };
}
