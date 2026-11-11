import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

// Accepts both the client and an interactive transaction.
export type Db = Prisma.TransactionClient;

// Short idle timeout: a paused serverless instance must not hold connections on the database pooler.
const IDLE_TIMEOUT_MS = 5_000;

export function createPrisma(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, idleTimeoutMillis: IDLE_TIMEOUT_MS }),
  });
}
