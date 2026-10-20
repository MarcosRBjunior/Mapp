import type { RequestHandler } from 'express';
import { countriesQuerySchema, countryParamsSchema, dateQuerySchema } from '../routes/schemas.js';
import type { CountriesService } from '../services/countries.service.js';

export function createCountriesController(service: CountriesService): {
  list: RequestHandler;
  detail: RequestHandler;
} {
  return {
    list: async (req, res) => {
      const { metric, date } = countriesQuerySchema.parse(req.query);
      res.json(await service.listCountries(metric, date));
    },
    detail: async (req, res) => {
      const { code } = countryParamsSchema.parse(req.params);
      const { date } = dateQuerySchema.parse(req.query);
      res.json(await service.getCountry(code, date));
    },
  };
}
