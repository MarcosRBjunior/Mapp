import express, { type Router } from 'express';
import { createCountriesController } from '../controllers/countries.controller.js';
import { createGlobalController } from '../controllers/global.controller.js';
import { createMetaController } from '../controllers/meta.controller.js';
import { createRankingsController } from '../controllers/rankings.controller.js';
import { createTimeseriesController } from '../controllers/timeseries.controller.js';
import { cacheByDataVersion } from '../middlewares/cache.js';
import type { Services } from '../services/create-services.js';

export function createV1Router(services: Services): Router {
  const router = express.Router();
  const meta = createMetaController(services.meta);
  const global = createGlobalController(services.global);
  const countries = createCountriesController(services.countries);
  const rankings = createRankingsController(services.rankings);
  const timeseries = createTimeseriesController(services.timeseries);

  const fresh = cacheByDataVersion(services.dataState);

  router.get('/meta', meta.get);
  router.get('/global', fresh, global.get);
  router.get('/countries', fresh, countries.list);
  router.get('/countries/:code', fresh, countries.detail);
  router.get('/rankings', fresh, rankings.list);
  router.get('/global/timeseries', fresh, timeseries.global);
  router.get('/countries/:code/timeseries', fresh, timeseries.country);
  return router;
}
