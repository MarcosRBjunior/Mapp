import type { RequestHandler } from 'express';
import { countryParamsSchema, timeseriesQuerySchema } from '../routes/schemas.js';
import type { TimeseriesService } from '../services/timeseries.service.js';

export function createTimeseriesController(service: TimeseriesService): {
  global: RequestHandler;
  country: RequestHandler;
} {
  return {
    global: async (req, res) => {
      const query = timeseriesQuerySchema.parse(req.query);
      res.json(await service.getGlobalSeries(query));
    },
    country: async (req, res) => {
      const { code } = countryParamsSchema.parse(req.params);
      const query = timeseriesQuerySchema.parse(req.query);
      res.json(await service.getCountrySeries(code, query));
    },
  };
}
