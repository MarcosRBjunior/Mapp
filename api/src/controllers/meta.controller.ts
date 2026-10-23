import type { RequestHandler } from 'express';
import { sendIfFresh } from '../middlewares/cache.js';
import type { MetaService } from '../services/meta.service.js';

export function createMetaController(service: MetaService): { get: RequestHandler } {
  return {
    get: async (req, res) => {
      const { meta, version } = await service.getMeta();
      if (meta.dataVersion === null) {
        // No data yet: the empty meta must not stay cached after the first sync.
        res.set('Cache-Control', 'no-store').json(meta);
        return;
      }
      if (sendIfFresh(req, res, `"${version}"`)) return;
      res.json(meta);
    },
  };
}
