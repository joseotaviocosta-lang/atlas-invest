import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { AllocationStrategyRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const strategies = new AllocationStrategyRepository(prisma);

const USER = 'ee666666-6666-4666-8666-666666666666';
const PORTFOLIO = 'e6666666-6666-4666-8666-666666666666';
const OTHER_PORTFOLIO = 'e7777777-7777-4777-8777-777777777777';

async function portfolio(id: string) {
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: 'strategy@atlas.dev', name: 'Strategy', passwordHash: 'x' },
  });
  await prisma.portfolio.create({
    data: {
      id,
      userId: USER,
      name: `P-${id.slice(0, 8)}`,
      baseCurrency: 'BRL',
      type: 'PERSONAL',
      status: 'ACTIVE',
    },
  });
}

/**
 * Phase 5Q-C — allocation strategy persistence.
 *
 * One row per (portfolio, category); replace() swaps the whole set
 * atomically; clearing removes intent only. No totals, no advice, no
 * secrets stored — just declared integer weights.
 */
describe('Phase 5Q-C: allocation strategy persistence', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await portfolio(PORTFOLIO);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates nothing by default (no strategy until the user declares one)', async () => {
    expect(await strategies.listByPortfolio(PORTFOLIO)).toEqual([]);
  });

  it('replaces the whole set atomically', async () => {
    await strategies.replace(PORTFOLIO, [
      { category: 'STOCK', targetBp: 6000 },
      { category: 'CASH', targetBp: 4000 },
    ]);
    const replaced = await strategies.replace(PORTFOLIO, [
      { category: 'STOCK', targetBp: 5000 },
      { category: 'FII', targetBp: 5000 },
    ]);
    expect(replaced.map((row) => row.category).sort()).toEqual(['FII', 'STOCK']);
    const rows = await strategies.listByPortfolio(PORTFOLIO);
    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum, row) => sum + row.targetBp, 0)).toBe(10000);
  });

  it('clears without touching anything else', async () => {
    await strategies.replace(PORTFOLIO, [{ category: 'STOCK', targetBp: 10000 }]);
    await strategies.clear(PORTFOLIO);
    expect(await strategies.listByPortfolio(PORTFOLIO)).toEqual([]);
    expect(await prisma.portfolio.findUnique({ where: { id: PORTFOLIO } })).not.toBeNull();
  });

  it('enforces one row per portfolio and category', async () => {
    await strategies.replace(PORTFOLIO, [{ category: 'STOCK', targetBp: 10000 }]);
    await expect(
      prisma.portfolioAllocationStrategyTarget.create({
        data: { portfolioId: PORTFOLIO, category: 'STOCK', targetBp: 5000 },
      }),
    ).rejects.toThrow();
  });

  it('cascades on portfolio delete without orphans', async () => {
    await strategies.replace(PORTFOLIO, [{ category: 'STOCK', targetBp: 10000 }]);
    await prisma.portfolio.delete({ where: { id: PORTFOLIO } });
    expect(
      await prisma.portfolioAllocationStrategyTarget.count({ where: { portfolioId: PORTFOLIO } }),
    ).toBe(0);
  });

  it('keeps portfolios isolated', async () => {
    await portfolio(OTHER_PORTFOLIO);
    await strategies.replace(PORTFOLIO, [{ category: 'STOCK', targetBp: 10000 }]);
    expect(await strategies.listByPortfolio(OTHER_PORTFOLIO)).toEqual([]);
  });

  it('concurrent replaces converge to one complete strategy', async () => {
    const first = [
      { category: 'STOCK', targetBp: 6000 },
      { category: 'FIXED_INCOME', targetBp: 4000 },
    ];
    const second = [
      { category: 'STOCK', targetBp: 3000 },
      { category: 'FII', targetBp: 7000 },
    ];
    await Promise.all([
      strategies.replace(PORTFOLIO, first),
      strategies.replace(PORTFOLIO, second),
    ]);
    const rows = await strategies.listByPortfolio(PORTFOLIO);
    const total = rows.reduce((sum, row) => sum + row.targetBp, 0);
    expect(total).toBe(10000);
    const asSets = [
      JSON.stringify(first.map((item) => item.category).sort()),
      JSON.stringify(second.map((item) => item.category).sort()),
    ];
    expect(asSets).toContain(JSON.stringify(rows.map((row) => row.category).sort()));
  });
});
