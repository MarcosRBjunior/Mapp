import express, { type Express } from 'express';
import { healthRouter } from './routes/health.routes.js';

export function createApp(): Express {
  const app = express();
  app.use(healthRouter);
  return app;
}
