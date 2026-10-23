import express, { type Router } from 'express';
import { createCountriesController } from '../controllers/countries.controller.js';
import { createGlobalController } from '../controllers/global.controller.js';
import { createMetaController } from '../controllers/meta.controller.js';
import { createRankingsController } from '../controllers/rankings.controller.js';
import { createTimeseriesController } from '../controllers/timeseries.controller.js';
import type { Services } from '../services/create-services.js';

export function createV1Router(services: Services): Router {
  const router = express.Router();
  const meta = createMetaController(services.meta);
  const global = createGlobalController(services.global);
  const countries = createCountriesController(services.countries);
  const rankings = createRankingsController(services.rankings);
  const timeseries = createTimeseriesController(services.timeseries);

  router.get('/meta', meta.get);
  router.get('/global', global.get);
  router.get('/countries', countries.list);
  router.get('/countries/:code', countries.detail);
  router.get('/rankings', rankings.list);
  router.get('/global/timeseries', timeseries.global);
  router.get('/countries/:code/timeseries', timeseries.country);
  return router;
}
