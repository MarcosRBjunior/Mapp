import type { Express } from 'express';
import type { Logger } from 'pino';
import { createApp } from './app.js';
import type { Env } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { createLogger } from './lib/logger.js';
import { createPrisma } from './lib/prisma.js';
import { createReadRepositories } from './repositories/read-repositories.js';
import { createServices } from './services/create-services.js';

export interface Runtime {
  app: Express;
  prisma: PrismaClient;
  logger: Logger;
}

// Shared by the local server (server.ts) and the Vercel function (api/index.ts).
export function createRuntime(env: Env): Runtime {
  const logger = createLogger(env.LOG_LEVEL);
  const prisma = createPrisma(env.DATABASE_URL);
  const services = createServices(createReadRepositories(prisma), env.DATA_PROVIDER);
  const app = createApp({
    services,
    logger,
    webOrigin: env.WEB_ORIGIN,
    trustProxy: env.TRUST_PROXY,
  });
  return { app, prisma, logger };
}
