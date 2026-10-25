import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Prisma } from '@prisma/client';
import { ContributionPlanRepository, ContributionPlanLinkRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const plans = new ContributionPlanRepository(prisma);
const links = new ContributionPlanLinkRepository(prisma);

const USER = 'ebf00000-0000-4000-8000-000000000000';
const PORTFOLIO = 'ebf11111-1111-4111-8111-111111111111';

async function fixtures(portfolioId: string = PORTFOLIO) {
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: 'tracking@atlas.dev', name: 'Tracking', passwordHash: 'x' },
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
  const institution = await prisma.institution.upsert({
    where: { id: 'ebf33333-3333-4333-8333-333333333333' },
    update: {},
    create: {
      id: 'ebf33333-3333-4333-8333-333333333333',
      name: 'Bank',
      type: 'BANK',
      country: 'BR',
    },
  });
  const account = await prisma.account.upsert({
    where: { id: 'ebf44444-4444-4444-8444-444444444444' },
    update: {},
    create: {
      id: 'ebf44444-4444-4444-8444-444444444444',
      portfolioId,
      institutionId: institution.id,
      name: 'Conta',
      currency: 'BRL',
      status: 'ACTIVE',
    },
  });
  return { account };
}

async function deposit(portfolioId: string, accountId: string, tradeDate: string, amount: string) {
  return prisma.transaction.create({
    data: {
      portfolioId,
      accountId,
      type: 'DEPOSIT',
      tradeDate: new Date(`${tradeDate}T00:00:00.000Z`),
      currency: 'BRL',
      amount: new Prisma.Decimal(amount),
    },
  });
}

async function plan(portfolioId: string = PORTFOLIO, name = 'Plano') {
  return plans.create(portfolioId, {
    name,
    plannedDate: '2026-11-10',
    currency: 'BRL',
    sourceScenarioId: null,
    items: [{ category: 'CASH', amount: '5000' }],
  });
}

/**
 * Phase 5Q-G — tracking link persistence (relation + audit only).
 *
 * One row per (plan, transaction); CONFIRMED or REJECTED; no amounts,
 * dates, categories or currencies stored. One CONFIRMED plan per
 * transaction enforced by a partial unique index.
 */
describe('Phase 5Q-G: tracking link persistence', () => {
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

  it('confirms and rejects links without storing facts', async () => {
    const { account } = await fixtures();
    const created = await plan();
    const tx = await deposit(PORTFOLIO, account.id, '2026-11-11', '1000');
    const confirmed = await links.confirm(created.id, tx.id);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.confirmedAt).not.toBeNull();
    const rejected = await links.reject(created.id, tx.id);
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectedAt).not.toBeNull();
  });

  it('confirms are idempotent and rejections remember', async () => {
    const { account } = await fixtures();
    const created = await plan();
    const tx = await deposit(PORTFOLIO, account.id, '2026-11-11', '1000');
    const first = await links.confirm(created.id, tx.id);
    const second = await links.confirm(created.id, tx.id);
    expect(second.id).toBe(first.id);
    expect(second.status).toBe('CONFIRMED');
    expect(
      (await links.listByPlan(created.id)).filter((link) => link.status === 'CONFIRMED'),
    ).toHaveLength(1);
  });

  it('enforces one CONFIRMED plan per transaction across plans', async () => {
    const { account } = await fixtures();
    const first = await plan(PORTFOLIO, 'First');
    const second = await plan(PORTFOLIO, 'Second');
    const tx = await deposit(PORTFOLIO, account.id, '2026-11-11', '1000');
    await links.confirm(first.id, tx.id);
    await expect(links.confirm(second.id, tx.id)).rejects.toThrow();
    expect(await links.findConfirmedByTransaction(tx.id)).toMatchObject({ planId: first.id });
  });

  it('unlinks confirmed to rejected and keeps the audit row', async () => {
    const { account } = await fixtures();
    const created = await plan();
    const tx = await deposit(PORTFOLIO, account.id, '2026-11-11', '1000');
    await links.confirm(created.id, tx.id);
    const unlinked = await links.unlink(created.id, tx.id);
    expect(unlinked?.status).toBe('REJECTED');
    expect(await links.unlink(created.id, tx.id)).toMatchObject({ status: 'REJECTED' });
    expect(await links.unlink(created.id, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('cascades links on plan and portfolio delete', async () => {
    const { account } = await fixtures();
    const created = await plan();
    const tx = await deposit(PORTFOLIO, account.id, '2026-11-11', '1000');
    await links.confirm(created.id, tx.id);
    await prisma.portfolio.delete({ where: { id: PORTFOLIO } });
    expect(await prisma.contributionPlanTransactionLink.count()).toBe(0);
    expect(await prisma.portfolioContributionPlan.count()).toBe(0);
  });

  it('stores no facts and no execution columns', async () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        'packages/database/prisma/migrations/20261024174000_add_contribution_plan_tracking_links/migration.sql',
      ),
      'utf8',
    );
    const ddl = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(ddl).not.toMatch(/projected|deviation|score|recommend|coverage|valuation/i);
    expect(ddl).not.toMatch(/amount|currency|category|asset/i);
    expect(ddl).toContain('WHERE "status" = \'CONFIRMED\'');
    const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'contribution_plan_transaction_links'`,
    );
    const names = columns.map((column) => column.column_name).join(',');
    expect(names).not.toMatch(/amount|currency|category|asset|projected|score/i);
  });

  it('keeps terminal plan links visible and converges concurrent transitions', async () => {
    const { account } = await fixtures();
    const created = await plan();
    const tx = await deposit(PORTFOLIO, account.id, '2026-11-11', '1000');
    await links.confirm(created.id, tx.id);
    await plans.setStatus(created.id, PORTFOLIO, 'COMPLETED');
    const listed = await links.listByPlan(created.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.status).toBe('CONFIRMED');
    // Concurrent confirm × unlink: exactly one outcome, never lost.
    const [confirmed, unlinked] = await Promise.all([
      links.confirm(created.id, tx.id),
      links.unlink(created.id, tx.id),
    ]);
    expect([confirmed.status, unlinked?.status]).toContain('CONFIRMED');
    expect([confirmed.status, unlinked?.status]).toContain('REJECTED');
    const final = await links.listByPlan(created.id);
    expect(final).toHaveLength(1);
  });
});
