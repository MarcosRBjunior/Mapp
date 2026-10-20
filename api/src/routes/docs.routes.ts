import express, { type Router } from 'express';
import swaggerUi, { type JsonObject } from 'swagger-ui-express';

// Swagger UI assets are served from node_modules, so the docs need no CDN.
export function createDocsRouter(document: JsonObject): Router {
  const router = express.Router();
  router.get('/openapi.json', (_req, res) => {
    res.json(document);
  });
  router.use(
    '/',
    swaggerUi.serveFiles(document),
    swaggerUi.setup(document, { customSiteTitle: 'Mapp API' }),
  );
  return router;
}
