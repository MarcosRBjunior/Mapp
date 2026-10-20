import type { Db } from '../lib/prisma.js';
import { createDataStateRepository, type DataStateRepository } from './data-state.repository.js';
import { createMetaRepository, type MetaRepository } from './meta.repository.js';
import { createStatsRepository, type StatsRepository } from './stats.repository.js';

export interface ReadRepositories {
  dataState: DataStateRepository;
  meta: MetaRepository;
  stats: StatsRepository;
}

export function createReadRepositories(db: Db): ReadRepositories {
  return {
    dataState: createDataStateRepository(db),
    meta: createMetaRepository(db),
    stats: createStatsRepository(db),
  };
}
