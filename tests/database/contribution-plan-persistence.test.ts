import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ContributionPlanRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const plans = new ContributionPlanRepository(prisma);

const USER = 'eaf00000-0000-4000-8000-000000000000';
const PORTFOLIO = 'eaf11111-1111-4111-8111-111111111111';
const OTHER_PORTFOLIO = 'eaf22222-2222-4222-8222-222222222222';

async function portfolio(id: string) {
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: 'plan@atlas.dev', name: 'Plan', passwordHash: 'x' },
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

const ITEMS = [
  { category: 'STOCK', amount: '2000' },
  { category: 'FIXED_INCOME', amount: '3000' },
];

function write(name: string, plannedDate = '2026-11-10', portfolioId: string = PORTFOLIO) {
  return plans.create(portfolioId, {
    name,
    plannedDate,
    currency: 'BRL',
    sourceScenarioId: null,
    items: ITEMS,
  });
}

/**
 * Phase 5Q-F — contribution plan persistence (intent only).
 *
 * One plan row + one row per (plan, category); exact Decimal amounts;
 * atomic writes; guarded transitions; date-only round-trips; cascade on
 * portfolio delete; no transaction linkage anywhere.
 */
describe('Phase 5Q-F: contribution plan persistence', () => {
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

  it('creates a PLANNED plan with its item set atomically', async () => {
    const created = await write('Aporte de novembro');
    expect(created.id).toBeDefined();
    expect(created.status).toBe('PLANNED');
    expect(created.currency).toBe('BRL');
    expect(created.plannedDate).toBe('2026-11-10');
    expect(created.completedAt).toBeNull();
    expect(created.items.map((item) => item.category).sort()).toEqual(['FIXED_INCOME', 'STOCK']);
    expect(created.items.find((item) => item.category === 'STOCK')?.amount).toBe('2000');
  });

  it('lists upcoming ascending and history newest-first', async () => {
    await write('Later', '2026-12-01');
    await write('Sooner', '2026-11-01');
    const completed = await write('Done', '2026-09-01');
    await plans.setStatus(completed.id, PORTFOLIO, 'COMPLETED');
    const upcoming = await plans.listByPortfolio(PORTFOLIO, 'PLANNED');
    expect(upcoming.map((row) => row.name)).toEqual(['Sooner', 'Later']);
    const history = await plans.listByPortfolio(PORTFOLIO, 'COMPLETED');
    expect(history.map((row) => row.name)).toEqual(['Done']);
  });

  it('finds the next planned contribution', async () => {
    expect(await plans.findNextPlanned(PORTFOLIO)).toBeNull();
    await write('Later', '2026-12-01');
    const sooner = await write('Sooner', '2026-11-01');
    // A past-due plan is still returned: the UI labels it pending.
    await write('Overdue', '2026-01-01');
    const next = await plans.findNextPlanned(PORTFOLIO);
    expect(next?.id).not.toBe(sooner.id);
    expect(next?.plannedDate).toBe('2026-01-01');
  });

  it('moves PLANNED to COMPLETED once, then refuses further moves', async () => {
    const created = await write('Once');
    const completed = await plans.setStatus(created.id, PORTFOLIO, 'COMPLETED');
    expect(completed?.status).toBe('COMPLETED');
    expect(completed?.completedAt).not.toBeNull();
    expect(await plans.setStatus(created.id, PORTFOLIO, 'CANCELLED')).toBeNull();
    expect(await plans.setStatus(created.id, PORTFOLIO, 'COMPLETED')).toBeNull();
    const row = await plans.findByIdAndPortfolio(created.id, PORTFOLIO);
    expect(row?.status).toBe('COMPLETED');
  });

  it('moves PLANNED to CANCELLED and refuses reopen', async () => {
    const created = await write('Dropped');
    const cancelled = await plans.setStatus(created.id, PORTFOLIO, 'CANCELLED');
    expect(cancelled?.status).toBe('CANCELLED');
    expect(cancelled?.completedAt).toBeNull();
    expect(await plans.setStatus(created.id, PORTFOLIO, 'COMPLETED')).toBeNull();
    expect(await plans.setStatus(created.id, PORTFOLIO, 'PLANNED')).toBeNull();
  });

  it('replaces PLANNED content atomically; terminal history is immutable', async () => {
    const created = await write('Before', '2026-11-10');
    const replaced = await plans.replace(created.id, PORTFOLIO, {
      name: 'After',
      plannedDate: '2026-12-10',
      currency: 'BRL',
      sourceScenarioId: null,
      items: [{ category: 'CASH', amount: '500.25' }],
    });
    expect(replaced?.name).toBe('After');
    expect(replaced?.plannedDate).toBe('2026-12-10');
    expect(replaced?.items).toHaveLength(1);
    await plans.setStatus(created.id, PORTFOLIO, 'COMPLETED');
    expect(
      await plans.replace(created.id, PORTFOLIO, {
        name: 'Mutated',
        plannedDate: '2026-12-10',
        currency: 'BRL',
        sourceScenarioId: null,
        items: [{ category: 'CASH', amount: '1' }],
      }),
    ).toBeNull();
    const row = await plans.findByIdAndPortfolio(created.id, PORTFOLIO);
    expect(row?.name).toBe('After');
  });

  it('deletes only PLANNED plans with cascading items', async () => {
    const created = await write('Doomed');
    expect(await plans.remove(created.id, PORTFOLIO)).toBe(true);
    expect(await plans.findByIdAndPortfolio(created.id, PORTFOLIO)).toBeNull();
    expect(
      await prisma.portfolioContributionPlanItem.count({ where: { planId: created.id } }),
    ).toBe(0);
    const kept = await write('Kept');
    await plans.setStatus(kept.id, PORTFOLIO, 'COMPLETED');
    expect(await plans.remove(kept.id, PORTFOLIO)).toBe(false);
    expect(await plans.findByIdAndPortfolio(kept.id, PORTFOLIO)).not.toBeNull();
  });

  it('cascades on portfolio delete without orphans', async () => {
    const created = await write('Orphan?');
    await prisma.portfolio.delete({ where: { id: PORTFOLIO } });
    expect(await prisma.portfolioContributionPlan.count()).toBe(0);
    expect(
      await prisma.portfolioContributionPlanItem.count({ where: { planId: created.id } }),
    ).toBe(0);
  });

  it('sets source scenario null when the scenario is deleted', async () => {
    const scenario = await prisma.portfolioAllocationScenario.create({
      data: {
        portfolioId: PORTFOLIO,
        name: 'Source',
        type: 'CONTRIBUTION',
        changes: { create: [{ category: 'STOCK', amount: '100' }] },
      },
    });
    const created = await plans.create(PORTFOLIO, {
      name: 'From scenario',
      plannedDate: '2026-11-10',
      currency: 'BRL',
      sourceScenarioId: scenario.id,
      items: ITEMS,
    });
    expect(created.sourceScenarioId).toBe(scenario.id);
    await prisma.portfolioAllocationScenario.delete({ where: { id: scenario.id } });
    const row = await plans.findByIdAndPortfolio(created.id, PORTFOLIO);
    expect(row?.sourceScenarioId).toBeNull();
    expect(row?.status).toBe('PLANNED');
  });

  it('enforces positive amounts and unique categories', async () => {
    const created = await write('Guarded');
    await expect(
      prisma.portfolioContributionPlanItem.create({
        data: { planId: created.id, category: 'STOCK', amount: '50' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.portfolioContributionPlanItem.create({
        data: { planId: created.id, category: 'CASH', amount: '0' },
      }),
    ).rejects.toThrow();
  });

  it('round-trips date-only without timezone shifts', async () => {
    const created = await write('Leap', '2024-02-29');
    expect(created.plannedDate).toBe('2024-02-29');
    const reloaded = await plans.findByIdAndPortfolio(created.id, PORTFOLIO);
    expect(reloaded?.plannedDate).toBe('2024-02-29');
    // Raw DATE column holds no time component (compare as text, tz-independent).
    const raw = await prisma.$queryRawUnsafe<Array<{ planned_date: string }>>(
      `SELECT planned_date::text AS planned_date FROM portfolio_contribution_plans WHERE id = '${created.id}'`,
    );
    expect(raw[0]?.planned_date).toBe('2024-02-29');
  });

  it('has no transaction linkage or projected-result columns', async () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        'packages/database/prisma/migrations/20261024173000_add_portfolio_contribution_plans/migration.sql',
      ),
      'utf8',
    );
    const ddl = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(ddl).not.toMatch(/projected|deviation|weight|score|recommend|coverage|valuation/i);
    expect(ddl).not.toMatch(/transaction|ledger|order|execut/i);
    const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name IN ('portfolio_contribution_plans','portfolio_contribution_plan_items')`,
    );
    const names = columns.map((column) => column.column_name).join(',');
    expect(names).not.toMatch(/projected|deviation|score|recommend|transaction|ledger|order/i);
  });

  it('keeps portfolios isolated and converges concurrent transitions', async () => {
    await portfolio(OTHER_PORTFOLIO);
    const created = await write('Mine');
    expect(await plans.listByPortfolio(OTHER_PORTFOLIO)).toEqual([]);
    expect(await plans.findByIdAndPortfolio(created.id, OTHER_PORTFOLIO)).toBeNull();
    // complete × cancel: exactly one terminal state wins, never mixed.
    const [first, second] = await Promise.all([
      plans.setStatus(created.id, PORTFOLIO, 'COMPLETED'),
      plans.setStatus(created.id, PORTFOLIO, 'CANCELLED'),
    ]);
    expect([first?.status ?? null, second?.status ?? null].filter(Boolean)).toHaveLength(1);
    const row = await plans.findByIdAndPortfolio(created.id, PORTFOLIO);
    expect(['COMPLETED', 'CANCELLED']).toContain(row?.status);
  });
});
