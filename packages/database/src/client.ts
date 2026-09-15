import { PrismaClient } from '@prisma/client';

let globalPrismaClient: PrismaClient | null = null;

export interface PrismaClientOptions {
  databaseUrl?: string;
  logQueries?: boolean;
}

export function getPrismaClient(options?: PrismaClientOptions): PrismaClient {
  const url = options?.databaseUrl ?? process.env.DATABASE_URL;

  if (globalPrismaClient) {
    return globalPrismaClient;
  }

  globalPrismaClient = new PrismaClient({
    datasourceUrl: url,
    log: options?.logQueries ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  });

  return globalPrismaClient;
}

export async function disconnectPrismaClient(): Promise<void> {
  if (globalPrismaClient) {
    await globalPrismaClient.$disconnect();
    globalPrismaClient = null;
  }
}
