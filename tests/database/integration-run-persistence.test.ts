import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { IntegrationRunRepository } from '@atlas/database';
import { getTestPrismaClient, cleanDatabase, disconnectTestDatabase } from './setup';

const prisma = getTestPrismaClient();
const runs = new IntegrationRunRepository(prisma);

const USER = 'ee333333-3333-4333-8333-333333333333';
const PORTFOLIO = 'e1111111-1111-4111-8111-111111111111';
const OTHER_PORTFOLIO = 'e2222222-2222-4222-8222-222222222222';

async function portfolio(id: string) {
  await prisma.user.upsert({
    where: { id: USER },
    update: {},
    create: { id: USER, email: 'runs@atlas.dev', name: 'Runs', passwordHash: 'x' },
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

describe('Phase 5P-PRE: integration run persistence', () => {
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

  it('creates a STARTED run and records preview counts', async () => {
    const created = await runs.create({
      portfolioId: PORTFOLIO,
      source: 'CSV',
      provider: 'XP',
      fileName: 'ops.csv',
    });
    expect(created.status).toBe('STARTED');
    expect(created.confirmed).toBe(0);

    const previewed = await runs.recordPreview({
      id: created.id,
      portfolioId: PORTFOLIO,
      status: 'AWAITING_REVIEW',
      recordsFetched: 10,
      recordsNormalized: 10,
      newCandidates: 7,
      exactDuplicates: 2,
      probableDuplicates: 1,
      conflicts: 0,
      unsupported: 0,
      invalid: 0,
    });
    expect(previewed.status).toBe('AWAITING_REVIEW');
    expect(previewed.newCandidates).toBe(7);
    expect(previewed.exactDuplicates).toBe(2);
    expect(previewed.probableDuplicates).toBe(1);
  });

  it('records confirmation with reconciliation and completes the run', async () => {
    const created = await runs.create({
      portfolioId: PORTFOLIO,
      source: 'B3',
      provider: 'B3',
      environment: 'SIMULATED',
    });
    await runs.recordPreview({
      id: created.id,
      portfolioId: PORTFOLIO,
      status: 'AWAITING_REVIEW',
      recordsFetched: 5,
      recordsNormalized: 5,
      newCandidates: 5,
      exactDuplicates: 0,
      probableDuplicates: 0,
      conflicts: 0,
      unsupported: 0,
      invalid: 0,
      sourceAsOf: '2026-05-31',
    });
    const done = await runs.recordConfirmation({
      id: created.id,
      portfolioId: PORTFOLIO,
      status: 'COMPLETED',
      confirmed: 5,
      ignored: 0,
      partial: false,
      reconciliation: {
        matched: 3,
        divergent: 0,
        missingLocal: 0,
        missingSource: 0,
        unresolved: 0,
      },
    });
    expect(done.status).toBe('COMPLETED');
    expect(done.confirmed).toBe(5);
    expect(done.reconciliation).toEqual({
      matched: 3,
      divergent: 0,
      missingLocal: 0,
      missingSource: 0,
      unresolved: 0,
    });
    expect(done.completedAt).not.toBeNull();
    expect(done.sourceAsOf).toBe('2026-05-31');
  });

  it('terminal runs are immutable: confirmation and failure both reject', async () => {
    const created = await runs.create({ portfolioId: PORTFOLIO, source: 'CSV' });
    await runs.recordPreview({
      id: created.id,
      portfolioId: PORTFOLIO,
      status: 'AWAITING_REVIEW',
      recordsFetched: 1,
      recordsNormalized: 1,
      newCandidates: 1,
      exactDuplicates: 0,
      probableDuplicates: 0,
      conflicts: 0,
      unsupported: 0,
      invalid: 0,
    });
    await runs.recordConfirmation({
      id: created.id,
      portfolioId: PORTFOLIO,
      status: 'COMPLETED',
      confirmed: 1,
      ignored: 0,
      partial: false,
    });
    await expect(
      runs.recordConfirmation({
        id: created.id,
        portfolioId: PORTFOLIO,
        status: 'COMPLETED',
        confirmed: 1,
        ignored: 0,
        partial: false,
      }),
    ).rejects.toThrow();
    await expect(
      runs.recordFailure({
        id: created.id,
        portfolioId: PORTFOLIO,
        errorCode: 'X',
        errorMessage: 'y',
      }),
    ).rejects.toThrow();
    await expect(
      runs.recordPreview({
        id: created.id,
        portfolioId: PORTFOLIO,
        status: 'AWAITING_REVIEW',
        recordsFetched: 1,
        recordsNormalized: 1,
        newCandidates: 1,
        exactDuplicates: 0,
        probableDuplicates: 0,
        conflicts: 0,
        unsupported: 0,
        invalid: 0,
      }),
    ).rejects.toThrow();
  });

  it('records failures with safe codes and messages only', async () => {
    const created = await runs.create({ portfolioId: PORTFOLIO, source: 'B3', provider: 'B3' });
    const failed = await runs.recordFailure({
      id: created.id,
      portfolioId: PORTFOLIO,
      errorCode: 'B3_TRANSPORT.UPSTREAM_UNAVAILABLE',
      errorMessage: 'B3 upstream failure',
    });
    expect(failed.status).toBe('FAILED');
    expect(failed.errorCode).toBe('B3_TRANSPORT.UPSTREAM_UNAVAILABLE');
    expect(failed.errorMessage).toBe('B3 upstream failure');
    expect(failed.completedAt).not.toBeNull();
  });

  it('links confirmed transactions to a run idempotently', async () => {
    const created = await runs.create({ portfolioId: PORTFOLIO, source: 'CSV' });
    const tx = [
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-cccc-cccccccccccc',
      'dddddddd-dddd-4ddd-dddd-dddddddddddd',
    ];
    const linked = await runs.linkTransactions({
      runId: created.id,
      portfolioId: PORTFOLIO,
      transactionIds: [tx[0]!, tx[1]!, tx[2]!],
    });
    expect(linked).toBe(3);
    expect(await runs.listTransactionIdsByRun(created.id, PORTFOLIO)).toEqual([
      tx[0],
      tx[1],
      tx[2],
    ]);
    // Retry-safe: duplicates converge to the same linkage.
    expect(
      await runs.linkTransactions({
        runId: created.id,
        portfolioId: PORTFOLIO,
        transactionIds: [tx[1]!, tx[2]!, tx[3]!],
      }),
    ).toBe(1);
    expect(await runs.listTransactionIdsByRun(created.id, PORTFOLIO)).toEqual(tx);
    // Cross-portfolio linkage is scoped out.
    expect(await runs.listTransactionIdsByRun(created.id, OTHER_PORTFOLIO)).toEqual([]);
    expect(
      await runs.linkTransactions({
        runId: created.id,
        portfolioId: PORTFOLIO,
        transactionIds: [],
      }),
    ).toBe(0);
  });

  it('scopes reads by portfolio (anti-enumeration at the repository edge)', async () => {
    const created = await runs.create({ portfolioId: PORTFOLIO, source: 'CSV' });
    await portfolio(OTHER_PORTFOLIO);
    expect(await runs.findById(created.id, OTHER_PORTFOLIO)).toBeNull();
    expect((await runs.listByPortfolio(OTHER_PORTFOLIO, { limit: 50 })).rows).toHaveLength(0);
    expect(await runs.findById(created.id, PORTFOLIO)).not.toBeNull();
  });

  it('lists newest-first with cursor pagination and rejects forged cursors', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const created = await runs.create({
        portfolioId: PORTFOLIO,
        source: 'CSV',
        fileName: `f${i}.csv`,
      });
      ids.push(created.id);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const first = await runs.listByPortfolio(PORTFOLIO, { limit: 2 });
    expect(first.rows).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.rows.map((row) => row.fileName)).toEqual(['f2.csv', 'f1.csv']);
    const second = await runs.listByPortfolio(PORTFOLIO, { limit: 2, cursor: first.rows[1]!.id });
    expect(second.rows.map((row) => row.fileName)).toEqual(['f0.csv']);
    expect(second.hasMore).toBe(false);
    await expect(
      runs.listByPortfolio(PORTFOLIO, { limit: 2, cursor: ids[0]!.replace(/0/g, 'f') }),
    ).rejects.toThrow();
    expect(await runs.countByPortfolio(PORTFOLIO)).toBe(3);
  });

  it('persists no secrets, tokens, payloads or PII-adjacent material', async () => {
    const created = await runs.create({ portfolioId: PORTFOLIO, source: 'B3', provider: 'B3' });
    const row = await runs.findById(created.id, PORTFOLIO);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toMatch(/token|secret|password|certificate|private|payload|cpf|cnpj/i);
    expect(Object.keys(row ?? {}).sort()).toEqual(
      expect.arrayContaining(['source', 'provider', 'status', 'confirmed', 'sourceAsOf']),
    );
  });
});
