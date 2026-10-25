import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { ContributionGoalRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const goals = new ContributionGoalRepository(prisma);

const USER = 'ec000000-0000-4000-8000-000000000000';
const PORTFOLIO = 'ec111111-1111-4111-8111-111111111111';

async function fixtures(portfolioId: string = PORTFOLIO) {
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: 'goal@atlas.dev', name: 'Goal', passwordHash: 'x' },
  });
  await prisma.portfolio.upsert({
    where: { id: portfolioId },
    update: {},
    create: {
      id: portfolioId,
      userId: USER,
      name: `P-${portfolioId.slice(0, 8)}`,
      baseCurrency: 'BRL',
      type: 'PERSONAL',
      status: 'ACTIVE',
    },
  });
}

/**
 * Phase 5Q-J — contribution goal persistence (versioned intent only).
 *
 * One row per effective version; a single open-ended row per portfolio
 * (partial unique index). History is never mutated; only the month and
 * amount the user declared are stored.
 */
describe('Phase 5Q-J: contribution goal persistence', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await fixtures();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates an open goal version with exact money', async () => {
    const created = await goals.replaceOpen(PORTFOLIO, {
      amount: '3000.50',
      currency: 'BRL',
      effectiveFrom: '2026-11-01',
      closeOpenAt: null,
    });
    expect(created).not.toBeNull();
    expect(created).toMatchObject({
      portfolioId: PORTFOLIO,
      amount: '3000.5',
      currency: 'BRL',
      effectiveFrom: '2026-11-01',
      effectiveTo: null,
    });
  });

  it('finds the single open version and lists history newest-first', async () => {
    expect(await goals.findOpen(PORTFOLIO)).toBeNull();
    const first = await goals.replaceOpen(PORTFOLIO, {
      amount: '2000',
      currency: 'BRL',
      effectiveFrom: '2026-01-01',
      closeOpenAt: null,
    });
    const second = await goals.replaceOpen(PORTFOLIO, {
      amount: '3000',
      currency: 'BRL',
      effectiveFrom: '2026-07-01',
      closeOpenAt: '2026-07-01',
      expectedUpdatedAt: first!.updatedAt,
    });
    expect(second).not.toBeNull();
    const open = await goals.findOpen(PORTFOLIO);
    expect(open?.id).toBe(second!.id);
    const listed = await goals.listByPortfolio(PORTFOLIO);
    expect(listed.map((row) => row.effectiveFrom)).toEqual(['2026-07-01', '2026-01-01']);
    expect(listed.find((row) => row.id === first!.id)?.effectiveTo).toBe('2026-07-01');
  });

  it('updates the open version in place with an optimistic guard', async () => {
    const created = await goals.replaceOpen(PORTFOLIO, {
      amount: '3000',
      currency: 'BRL',
      effectiveFrom: '2026-11-01',
      closeOpenAt: null,
    });
    const updated = await goals.updateAmountIfOpen(
      created!.id,
      PORTFOLIO,
      '3500',
      created!.updatedAt,
    );
    expect(updated?.amount).toBe('3500');
    // Stale writer loses deterministically.
    expect(
      await goals.updateAmountIfOpen(created!.id, PORTFOLIO, '4000', created!.updatedAt),
    ).toBeNull();
    const current = await goals.findOpen(PORTFOLIO);
    expect(current?.amount).toBe('3500');
  });

  it('ends the open version and removes never-effective scheduled rows', async () => {
    const created = await goals.replaceOpen(PORTFOLIO, {
      amount: '3000',
      currency: 'BRL',
      effectiveFrom: '2030-01-01',
      closeOpenAt: null,
    });
    expect(await goals.removeById(created!.id, PORTFOLIO)).toBe(true);
    expect(await goals.findOpen(PORTFOLIO)).toBeNull();
    const live = await goals.replaceOpen(PORTFOLIO, {
      amount: '3000',
      currency: 'BRL',
      effectiveFrom: '2026-01-01',
      closeOpenAt: null,
    });
    const ended = await goals.endOpen(PORTFOLIO, '2026-10-01');
    expect(ended?.effectiveTo).toBe('2026-10-01');
    expect(await goals.findOpen(PORTFOLIO)).toBeNull();
    expect(await goals.removeById(live!.id, PORTFOLIO)).toBe(true);
  });

  it('enforces positive amounts and a single open version', async () => {
    await expect(
      prisma.portfolioContributionGoal.create({
        data: {
          portfolioId: PORTFOLIO,
          amount: '0',
          currency: 'BRL',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow();
    await goals.replaceOpen(PORTFOLIO, {
      amount: '3000',
      currency: 'BRL',
      effectiveFrom: '2026-01-01',
      closeOpenAt: null,
    });
    await expect(
      prisma.portfolioContributionGoal.create({
        data: {
          portfolioId: PORTFOLIO,
          amount: '4000',
          currency: 'BRL',
          effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow();
  });

  it('cascades on portfolio delete without orphans', async () => {
    await goals.replaceOpen(PORTFOLIO, {
      amount: '3000',
      currency: 'BRL',
      effectiveFrom: '2026-01-01',
      closeOpenAt: null,
    });
    await prisma.portfolio.delete({ where: { id: PORTFOLIO } });
    expect(await prisma.portfolioContributionGoal.count()).toBe(0);
  });

  it('round-trips effective months date-only without timezone shifts', async () => {
    const created = await goals.replaceOpen(PORTFOLIO, {
      amount: '3000',
      currency: 'BRL',
      effectiveFrom: '2024-02-01',
      closeOpenAt: null,
    });
    expect(created?.effectiveFrom).toBe('2024-02-01');
    const raw = await prisma.$queryRawUnsafe<Array<{ effective_from: string }>>(
      `SELECT effective_from::text AS effective_from FROM portfolio_contribution_goals WHERE id = '${created!.id}'`,
    );
    expect(raw[0]?.effective_from).toBe('2024-02-01');
  });

  it('converges concurrent writers on a single open version', async () => {
    const settled = await Promise.allSettled([
      goals.replaceOpen(PORTFOLIO, {
        amount: '3000',
        currency: 'BRL',
        effectiveFrom: '2026-11-01',
        closeOpenAt: null,
      }),
      goals.replaceOpen(PORTFOLIO, {
        amount: '4000',
        currency: 'BRL',
        effectiveFrom: '2026-11-01',
        closeOpenAt: null,
      }),
    ]);
    // Exactly one insert wins (partial unique index); the other fails.
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const open = await goals.findOpen(PORTFOLIO);
    expect(['3000', '4000']).toContain(open?.amount);
    expect(await prisma.portfolioContributionGoal.count({ where: { effectiveTo: null } })).toBe(1);
  });
});
