import express, { type Router } from 'express';
import { AppError } from '../lib/app-error.js';
import type { DataState, DataStateService } from '../services/data-state.service.js';

export function createHealthRouter(dataState: DataStateService): Router {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ status: 'ok' });
  });

  router.get('/ready', async (_req, res) => {
    let state: DataState | null;
    try {
      state = await dataState.current();
    } catch (error) {
      throw new AppError('DATA_NOT_READY', 503, 'data is not available', null, {
        cause: error,
      });
    }
    if (!state) throw new AppError('DATA_NOT_READY', 503, 'no data has been loaded yet');
    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'ready',
      dataVersion: state.dataVersion,
      referenceDate: state.referenceDate,
    });
  });

  return router;
}
