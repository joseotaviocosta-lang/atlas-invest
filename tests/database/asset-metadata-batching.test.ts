import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AssetRepository } from '@atlas/database';
import {
  getTestPrismaClient,
  cleanDatabase,
  disconnectTestDatabase,
  TEST_DATABASE_URL,
} from './setup';

const prisma = getTestPrismaClient();

/**
 * Closure B (4G.2A.1b.2): asset metadata is batch-resolved. `findByIds` issues a
 * single query for all distinct ids regardless of how many assets exist — never
 * one query per asset.
 */
describe('AssetRepository — batched metadata resolution', () => {
  let client: PrismaClient;
  let repo: AssetRepository;
  let assetQueries = 0;
  let cursor = 0;

  beforeAll(async () => {
    await cleanDatabase();
    client = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
      log: [{ emit: 'event', level: 'query' }],
    });
    client.$on('query', (event) => {
      if (event.query.includes('"assets"')) assetQueries += 1;
    });
    repo = new AssetRepository(client);
  });

  afterAll(async () => {
    await client.$disconnect();
    await cleanDatabase();
    await disconnectTestDatabase();
  });

  it('resolves N assets with exactly one query per read', async () => {
    const report: string[] = [];
    for (const size of [1, 5, 25, 50]) {
      const ids = Array.from({ length: size }, () => {
        cursor += 1;
        return `00000000-0000-4000-8000-${cursor.toString().padStart(12, '0')}`;
      });
      await prisma.asset.createMany({
        data: ids.map((id, index) => ({
          id,
          ticker: `BATCH${cursor}${index}`,
          name: 'Batch Asset',
          type: 'STOCK',
          currency: 'BRL',
          exchange: 'B3',
        })),
      });

      assetQueries = 0;
      const assets = await repo.findByIds(ids);
      expect(assets).toHaveLength(size);
      expect(assetQueries).toBe(1);
      report.push(`assets=${size} assetQueries=${assetQueries}`);
    }
    console.info(`[asset-batching]\n${report.join('\n')}`);
  });
});
