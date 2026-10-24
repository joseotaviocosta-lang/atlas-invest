import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AllocationScenarioRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const scenarios = new AllocationScenarioRepository(prisma);

const USER = 'ee777777-7777-4777-8777-777777777777';
const PORTFOLIO = 'e8888888-8888-4888-8888-888888888888';
const OTHER_PORTFOLIO = 'e9999999-9999-4999-8999-999999999999';

async function portfolio(id: string) {
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: 'scenario@atlas.dev', name: 'Scenario', passwordHash: 'x' },
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

const CHANGES = [
  { category: 'STOCK', amount: '3000' },
  { category: 'FIXED_INCOME', amount: '7000' },
];

/**
 * Phase 5Q-E — saved scenario persistence (input only).
 *
 * One scenario row + one row per (scenario, category); amounts are exact
 * Decimal strings; creates/replaces are atomic; deletes cascade.
 * No projected values, weights, deviations or recommendations stored.
 */
describe('Phase 5Q-E: saved scenario persistence', () => {
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

  it('creates a scenario with its change set atomically', async () => {
    const created = await scenarios.create(PORTFOLIO, {
      name: 'Aporte de novembro',
      type: 'CONTRIBUTION',
      changes: CHANGES,
    });
    expect(created.id).toBeDefined();
    expect(created.name).toBe('Aporte de novembro');
    expect(created.type).toBe('CONTRIBUTION');
    expect(created.changes.map((change) => change.category).sort()).toEqual([
      'FIXED_INCOME',
      'STOCK',
    ]);
    expect(created.changes.find((change) => change.category === 'STOCK')?.amount).toBe('3000');
    expect(await scenarios.countByPortfolio(PORTFOLIO)).toBe(1);
  });

  it('lists most-recently-touched first with deterministic tie-break', async () => {
    const first = await scenarios.create(PORTFOLIO, {
      name: 'First',
      type: 'CONTRIBUTION',
      changes: CHANGES,
    });
    const second = await scenarios.create(PORTFOLIO, {
      name: 'Second',
      type: 'CONTRIBUTION',
      changes: CHANGES,
    });
    const listed = await scenarios.listByPortfolio(PORTFOLIO);
    expect(listed.map((row) => row.id)).toEqual([second.id, first.id]);
  });

  it('gets by scoped id and misses across portfolios', async () => {
    await portfolio(OTHER_PORTFOLIO);
    const created = await scenarios.create(PORTFOLIO, {
      name: 'Scoped',
      type: 'CONTRIBUTION',
      changes: CHANGES,
    });
    expect(await scenarios.findByIdAndPortfolio(created.id, PORTFOLIO)).not.toBeNull();
    expect(await scenarios.findByIdAndPortfolio(created.id, OTHER_PORTFOLIO)).toBeNull();
    expect(
      await scenarios.findByIdAndPortfolio('00000000-0000-4000-8000-000000000000', PORTFOLIO),
    ).toBeNull();
  });

  it('replaces name and changes atomically without leftovers', async () => {
    const created = await scenarios.create(PORTFOLIO, {
      name: 'Before',
      type: 'CONTRIBUTION',
      changes: CHANGES,
    });
    const replaced = await scenarios.replace(created.id, PORTFOLIO, {
      name: 'After',
      type: 'CONTRIBUTION',
      changes: [{ category: 'CASH', amount: '500.25' }],
    });
    expect(replaced?.name).toBe('After');
    expect(replaced?.changes).toHaveLength(1);
    expect(replaced?.changes[0]).toMatchObject({ category: 'CASH', amount: '500.25' });
    expect(
      await prisma.portfolioAllocationScenarioChange.count({
        where: { scenarioId: created.id },
      }),
    ).toBe(1);
  });

  it('replace on an absent or foreign scenario returns null without creating', async () => {
    await portfolio(OTHER_PORTFOLIO);
    expect(
      await scenarios.replace('00000000-0000-4000-8000-000000000000', PORTFOLIO, {
        name: 'Ghost',
        type: 'CONTRIBUTION',
        changes: CHANGES,
      }),
    ).toBeNull();
    const foreign = await scenarios.create(OTHER_PORTFOLIO, {
      name: 'Foreign',
      type: 'CONTRIBUTION',
      changes: CHANGES,
    });
    expect(
      await scenarios.replace(foreign.id, PORTFOLIO, {
        name: 'Hijack',
        type: 'CONTRIBUTION',
        changes: CHANGES,
      }),
    ).toBeNull();
    expect(await scenarios.countByPortfolio(PORTFOLIO)).toBe(0);
  });

  it('deletes the scenario and cascades its changes', async () => {
    const created = await scenarios.create(PORTFOLIO, {
      name: 'Doomed',
      type: 'CONTRIBUTION',
      changes: CHANGES,
    });
    expect(await scenarios.remove(created.id, PORTFOLIO)).toBe(true);
    expect(await scenarios.findByIdAndPortfolio(created.id, PORTFOLIO)).toBeNull();
    expect(
      await prisma.portfolioAllocationScenarioChange.count({
        where: { scenarioId: created.id },
      }),
    ).toBe(0);
    expect(await scenarios.remove(created.id, PORTFOLIO)).toBe(false);
  });

  it('cascades on portfolio delete without orphans', async () => {
    const created = await scenarios.create(PORTFOLIO, {
      name: 'Orphan?',
      type: 'CONTRIBUTION',
      changes: CHANGES,
    });
    await prisma.portfolio.delete({ where: { id: PORTFOLIO } });
    expect(await prisma.portfolioAllocationScenario.count()).toBe(0);
    expect(
      await prisma.portfolioAllocationScenarioChange.count({
        where: { scenarioId: created.id },
      }),
    ).toBe(0);
  });

  it('enforces positive amounts and unique categories', async () => {
    const created = await scenarios.create(PORTFOLIO, {
      name: 'Guarded',
      type: 'CONTRIBUTION',
      changes: [{ category: 'STOCK', amount: '100' }],
    });
    await expect(
      prisma.portfolioAllocationScenarioChange.create({
        data: { scenarioId: created.id, category: 'STOCK', amount: '50' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.portfolioAllocationScenarioChange.create({
        data: { scenarioId: created.id, category: 'CASH', amount: '0' },
      }),
    ).rejects.toThrow();
  });

  it('stores input only: no projected/result columns exist', async () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        'packages/database/prisma/migrations/20261024170000_add_portfolio_allocation_scenarios/migration.sql',
      ),
      'utf8',
    );
    // Strip line comments: the prose may mention what is NOT stored.
    const ddl = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(ddl).not.toMatch(/projected|deviation|weight|score|recommend|coverage|valuation/i);
    const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name IN ('portfolio_allocation_scenarios','portfolio_allocation_scenario_changes')`,
    );
    const names = columns.map((column) => column.column_name).join(',');
    expect(names).not.toMatch(/projected|deviation|weight|score|recommend|coverage|valuation/i);
  });

  it('keeps portfolios isolated', async () => {
    await portfolio(OTHER_PORTFOLIO);
    await scenarios.create(PORTFOLIO, {
      name: 'Mine',
      type: 'CONTRIBUTION',
      changes: CHANGES,
    });
    expect(await scenarios.listByPortfolio(OTHER_PORTFOLIO)).toEqual([]);
    expect(await scenarios.countByPortfolio(OTHER_PORTFOLIO)).toBe(0);
  });

  it('concurrent updates converge without partial change sets', async () => {
    const created = await scenarios.create(PORTFOLIO, {
      name: 'Racy',
      type: 'CONTRIBUTION',
      changes: [{ category: 'STOCK', amount: '100' }],
    });
    const first = [{ category: 'STOCK', amount: '1000' }];
    const second = [
      { category: 'FUND', amount: '500' },
      { category: 'CASH', amount: '500' },
    ];
    await Promise.all([
      scenarios.replace(created.id, PORTFOLIO, {
        name: 'R1',
        type: 'CONTRIBUTION',
        changes: first,
      }),
      scenarios.replace(created.id, PORTFOLIO, {
        name: 'R2',
        type: 'CONTRIBUTION',
        changes: second,
      }),
    ]);
    const row = await scenarios.findByIdAndPortfolio(created.id, PORTFOLIO);
    const asSets = [
      JSON.stringify(first.map((item) => item.category).sort()),
      JSON.stringify(second.map((item) => item.category).sort()),
    ];
    expect(asSets).toContain(JSON.stringify(row!.changes.map((change) => change.category).sort()));
  });
});
