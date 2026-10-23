import type { Request, RequestHandler, Response } from 'express';
import type { DataStateService } from '../services/data-state.service.js';

export const CACHE_CONTROL = 'public, max-age=3600';

// Weak comparison (RFC 9110): W/ is ignored and `*` matches any current representation.
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, '');
  return ifNoneMatch.split(',').some((tag) => tag.trim() === '*' || opaque(tag) === opaque(etag));
}

// Sets the cache headers; answers 304 and returns true when the client already has this version.
export function sendIfFresh(req: Request, res: Response, etag: string): boolean {
  res.set({ 'Cache-Control': CACHE_CONTROL, ETag: etag });
  if (!etagMatches(req.get('If-None-Match'), etag)) return false;
  res.status(304).end();
  return true;
}

// Same URL and same dataVersion give the same body, so a match answers 304 before validating
// the query or reading data. Without data the route itself answers 503.
export function cacheByDataVersion(dataState: DataStateService): RequestHandler {
  return async (req, res, next) => {
    const state = await dataState.current();
    if (state && sendIfFresh(req, res, `"v${state.dataVersion}"`)) return;
    next();
  };
}
