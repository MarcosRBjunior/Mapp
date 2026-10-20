import type { RequestHandler } from 'express';
import { dateQuerySchema } from '../routes/schemas.js';
import type { GlobalService } from '../services/global.service.js';

export function createGlobalController(service: GlobalService): { get: RequestHandler } {
  return {
    get: async (req, res) => {
      const { date } = dateQuerySchema.parse(req.query);
      res.json(await service.getGlobal(date));
    },
  };
}
