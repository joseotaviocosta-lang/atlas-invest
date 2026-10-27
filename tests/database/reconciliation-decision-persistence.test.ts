import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { cleanDatabase, getTestPrismaClient, seedBaseFixtures } from './setup';

/**
 * Phase 5S-B-R1 — reconciliation decision persistence (append-only).
 *
 * Covers: clean migration state, unique pair identity, FK integrity,
 * portfolio isolation and no historical rewrite. The table carries
 * identity + decision + audit only — never ledger or source payloads.
 */
describe('Database: reconciliation decisions (Phase 5S-B-R1)', () => {
  const prisma = getTestPrismaClient();
  let portfolioId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioId = fixtures.portfolioId;
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await prisma.reconciliationDecisionRecord.deleteMany({});
    await prisma.integrationRunTransaction.deleteMany({ where: { portfolioId } });
    await prisma.integrationRun.deleteMany({ where: { portfolioId } });
    await prisma.transaction.deleteMany({ where: { portfolioId } });
  });

  async function seedRun(status = 'COMPLETED'): Promise<string> {
    const run = await prisma.integrationRun.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: 'B3',
        status,
        trigger: 'MANUAL',
      },
    });
    return run.id;
  }

  async function seedTransaction(): Promise<string> {
    const account = await prisma.account.findFirstOrThrow({ where: { portfolioId } });
    const tx = await prisma.transaction.create({
      data: {
        id: randomUUID(),
        portfolioId,
        accountId: account.id,
        type: 'BUY',
        tradeDate: new Date('2026-03-01T00:00:00.000Z'),
        currency: 'BRL',
        provider: 'B3',
        externalId: `tx-5sr-${randomUUID()}`,
      },
    });
    return tx.id;
  }

  it('persists a decision with identity, decision and audit fields', async () => {
    const runId = await seedRun();
    const txId = await seedTransaction();
    await prisma.integrationRunTransaction.create({
      data: { runId, portfolioId, transactionId: txId },
    });

    const created = await prisma.reconciliationDecisionRecord.create({
      data: {
        id: randomUUID(),
        portfolioId,
        integrationRunId: runId,
        source: 'B3',
        sourceItemKey: 'B3:TX-1',
        localTransactionId: txId,
        decision: 'CONFIRM_MATCH',
        decidedByPrincipal: 'user-1',
        decidedAt: new Date('2026-10-26T12:00:00.000Z'),
      },
    });

    expect(created.id).toBeDefined();
    expect(created.decision).toBe('CONFIRM_MATCH');
    expect(created.decidedByPrincipal).toBe('user-1');
    expect(created.decidedAt.toISOString()).toBe('2026-10-26T12:00:00.000Z');
    expect(created.createdAt).toBeDefined();

    const found = await prisma.reconciliationDecisionRecord.findUnique({
      where: {
        portfolioId_integrationRunId_sourceItemKey_localTransactionId: {
          portfolioId,
          integrationRunId: runId,
          sourceItemKey: 'B3:TX-1',
          localTransactionId: txId,
        },
      },
    });
    expect(found?.id).toBe(created.id);
  });

  it('rejects duplicate pair identity at the database level', async () => {
    const runId = await seedRun();
    const txId = await seedTransaction();
    const base = {
      id: randomUUID(),
      portfolioId,
      integrationRunId: runId,
      source: 'B3',
      sourceItemKey: 'B3:TX-9',
      localTransactionId: txId,
      decision: 'CONFIRM_MATCH' as const,
      decidedByPrincipal: 'user-1',
      decidedAt: new Date(),
    };
    await prisma.reconciliationDecisionRecord.create({ data: base });
    await expect(
      prisma.reconciliationDecisionRecord.create({
        data: { ...base, id: randomUUID(), decision: 'NOT_A_MATCH' },
      }),
    ).rejects.toThrow();
    const rows = await prisma.reconciliationDecisionRecord.findMany({
      where: { integrationRunId: runId },
    });
    expect(rows).toHaveLength(1);
  });

  it('enforces foreign keys and portfolio isolation', async () => {
    // Unknown run.
    await expect(
      prisma.reconciliationDecisionRecord.create({
        data: {
          id: randomUUID(),
          portfolioId,
          integrationRunId: randomUUID(),
          source: 'B3',
          sourceItemKey: 'B3:X',
          localTransactionId: randomUUID(),
          decision: 'CONFIRM_MATCH',
          decidedByPrincipal: 'user-1',
          decidedAt: new Date(),
        },
      }),
    ).rejects.toThrow();

    // Unknown transaction.
    const runId = await seedRun();
    await expect(
      prisma.reconciliationDecisionRecord.create({
        data: {
          id: randomUUID(),
          portfolioId,
          integrationRunId: runId,
          source: 'B3',
          sourceItemKey: 'B3:Y',
          localTransactionId: randomUUID(),
          decision: 'CONFIRM_MATCH',
          decidedByPrincipal: 'user-1',
          decidedAt: new Date(),
        },
      }),
    ).rejects.toThrow();

    // Cross-portfolio read isolation.
    const txId = await seedTransaction();
    await prisma.reconciliationDecisionRecord.create({
      data: {
        id: randomUUID(),
        portfolioId,
        integrationRunId: runId,
        source: 'B3',
        sourceItemKey: 'B3:Z',
        localTransactionId: txId,
        decision: 'NOT_A_MATCH',
        decidedByPrincipal: 'user-1',
        decidedAt: new Date(),
      },
    });
    const foreign = await prisma.reconciliationDecisionRecord.findMany({
      where: { portfolioId: randomUUID() },
    });
    expect(foreign).toEqual([]);
    const scoped = await prisma.reconciliationDecisionRecord.findMany({
      where: { portfolioId, integrationRunId: runId },
    });
    expect(scoped).toHaveLength(1);
  });

  it('leaves historical runs without decisions untouched', async () => {
    const runId = await seedRun('COMPLETED');
    const rows = await prisma.reconciliationDecisionRecord.findMany({
      where: { integrationRunId: runId },
    });
    // No backfill: historical runs keep zero decision rows.
    expect(rows).toEqual([]);
  });

  it('lists decisions and link counts per run for workflow derivation', async () => {
    const runA = await seedRun('AWAITING_REVIEW');
    const runB = await seedRun('COMPLETED');
    const tx1 = await seedTransaction();
    const tx2 = await seedTransaction();
    await prisma.integrationRunTransaction.createMany({
      data: [
        { runId: runA, portfolioId, transactionId: tx1 },
        { runId: runA, portfolioId, transactionId: tx2 },
        { runId: runB, portfolioId, transactionId: tx2 },
      ],
    });

    const { ReconciliationDecisionRepository } =
      await import('../../packages/database/src/repositories/reconciliation-decision.repository');
    const { IntegrationRunRepository } =
      await import('../../packages/database/src/repositories/integration-run.repository');
    const decisions = new ReconciliationDecisionRepository(prisma);
    const runs = new IntegrationRunRepository(prisma);

    const byRuns = await decisions.listByRunIds([runA, runB], portfolioId);
    expect(byRuns).toEqual([]);
    await decisions.create({
      portfolioId,
      integrationRunId: runA,
      source: 'B3',
      sourceItemKey: 'B3:K1',
      localTransactionId: tx1,
      decision: 'CONFIRM_MATCH',
      decidedByPrincipal: 'user-1',
      decidedAt: new Date(),
    });
    const after = await decisions.listByRunIds([runA, runB], portfolioId);
    expect(after).toHaveLength(1);
    expect(after[0]?.integrationRunId).toBe(runA);

    const counts = await runs.countLinksByRunIds([runA, runB, randomUUID()], portfolioId);
    const byRun = new Map(counts.map((entry) => [entry.runId, entry.count]));
    expect(byRun.get(runA)).toBe(2);
    expect(byRun.get(runB)).toBe(1);
    expect(byRun.has(randomUUID())).toBe(false);
    expect(await runs.countLinksByRunIds([], portfolioId)).toEqual([]);
    expect(await decisions.listByRunIds([], portfolioId)).toEqual([]);
  });
});
