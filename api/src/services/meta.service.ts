import type {
  EntityName,
  LastSyncRecord,
  MetaRepository,
} from '../repositories/meta.repository.js';
import type { DataStateService } from './data-state.service.js';

export interface MetaResponse {
  source: { code: string; name: string; url: string; license: string; attribution: string };
  coverage: { from: string; to: string; countries: number } | null;
  referenceDate: string | null;
  lastSync: {
    status: LastSyncRecord['status'];
    mode: LastSyncRecord['mode'];
    startedAt: string;
    finishedAt: string;
  } | null;
  dataVersion: number | null;
  nonGeographic: EntityName[];
}

export interface MetaService {
  getMeta(): Promise<{ meta: MetaResponse; version: string }>;
}

export function createMetaService(dataState: DataStateService, repo: MetaRepository): MetaService {
  return {
    async getMeta() {
      const source = await dataState.source();
      const [state, lastSync, nonGeographic] = await Promise.all([
        dataState.current(),
        repo.findLastFinishedSync(source.id),
        repo.listNonGeographic(),
      ]);
      const meta: MetaResponse = {
        source: {
          code: source.code,
          name: source.name,
          url: source.url,
          license: source.license,
          attribution: source.attribution,
        },
        coverage: state
          ? { from: state.from, to: state.referenceDate, countries: state.countries }
          : null,
        referenceDate: state?.referenceDate ?? null,
        lastSync: lastSync
          ? {
              status: lastSync.status,
              mode: lastSync.mode,
              startedAt: lastSync.startedAt.toISOString(),
              finishedAt: lastSync.finishedAt.toISOString(),
            }
          : null,
        dataVersion: state?.dataVersion ?? null,
        nonGeographic,
      };
      // lastSync changes even on a failed run, which keeps the dataVersion: the version covers both.
      return { meta, version: `v${state?.dataVersion ?? 0}.r${lastSync?.id ?? 0}` };
    },
  };
}
