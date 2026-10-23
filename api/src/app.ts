import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { errorHandler } from './middlewares/error-handler.js';
import { createHttpLogger } from './middlewares/http-logger.js';
import { notFound } from './middlewares/not-found.js';
import { createRateLimit } from './middlewares/rate-limit.js';
import { createOpenApiDocument } from './openapi/document.js';
import { createDocsRouter } from './routes/docs.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createV1Router } from './routes/v1.routes.js';
import type { Services } from './services/create-services.js';

export interface AppDeps {
  services: Services;
  logger: Logger;
  webOrigin: string;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  // ETags come from dataVersion (middlewares/cache.ts), not from a body hash.
  app.set('etag', false);
  app.use(createHttpLogger(deps.logger));
  app.use(helmet());
  app.use(
    cors({
      origin: deps.webOrigin,
      methods: ['GET', 'HEAD', 'OPTIONS'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  app.use(createHealthRouter(deps.services.dataState));

  const apiRouter = express.Router();
  apiRouter.use(createRateLimit());
  apiRouter.use('/docs', createDocsRouter(createOpenApiDocument()));
  apiRouter.use('/v1', createV1Router(deps.services));
  app.use('/api', apiRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
