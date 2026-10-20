import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

// Accepts both the client and an interactive transaction.
export type Db = Prisma.TransactionClient;

export function createPrisma(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
