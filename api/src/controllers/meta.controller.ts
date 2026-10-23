import type { RequestHandler } from 'express';
import { sendIfFresh } from '../middlewares/cache.js';
import type { MetaService } from '../services/meta.service.js';

export function createMetaController(service: MetaService): { get: RequestHandler } {
  return {
    get: async (req, res) => {
      const { meta, version } = await service.getMeta();
      if (sendIfFresh(req, res, `"${version}"`)) return;
      res.json(meta);
    },
  };
}
