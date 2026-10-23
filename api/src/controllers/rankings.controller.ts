import type { RequestHandler } from 'express';
import { rankingsQuerySchema } from '../routes/schemas.js';
import type { RankingsService } from '../services/rankings.service.js';

export function createRankingsController(service: RankingsService): { list: RequestHandler } {
  return {
    list: async (req, res) => {
      const { metric, limit, date } = rankingsQuerySchema.parse(req.query);
      res.json(await service.getRankings(metric, limit, date));
    },
  };
}
