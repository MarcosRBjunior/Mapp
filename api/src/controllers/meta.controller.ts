import type { RequestHandler } from 'express';
import type { MetaService } from '../services/meta.service.js';

export function createMetaController(service: MetaService): { get: RequestHandler } {
  return {
    get: async (_req, res) => {
      res.json(await service.getMeta());
    },
  };
}
