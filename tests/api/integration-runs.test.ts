import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
  seedBaseFixtures,
} from './setup';
import { CreateTransactionUseCase } from '../../apps/api/src/application/transactions';
import { IntegrationRunService } from '../../apps/api/src/application/imports';
import {
  SimulatedB3Provider,
  runSimulatedB3Sync,
  selectImportableCandidates,
  canonicalFingerprint,
  canonicalIncomeFingerprint,
  reconcilePositions,
  type ExistingLedgerRow,
} from '@atlas/import-engine';

/**
 * Phase 5P-PRE — integration run history end-to-end (real ledger, real API).
 *
 * Covers the CSV lifecycle (preview → run → confirm → completion) and the
 * B3 simulated lifecycle (start → sync → confirm → reconcile), plus failure,
 * partial, idempotency, ownership, pagination and the preview zero-write
 * invariant. No secrets, no payloads, no PII in run records.
 */
describe('API Integration: Integration run history (Phase 5P-PRE)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();
  const assetIds = new Map<string, string>();

  const CSV = [
    'data;ticker;operacao;quantidade;preco_unitario;taxas;moeda;corretora;conta;external_id',
    '15/01/2026;PETR4;COMPRA;100;38,50;4,90;BRL;XP;Test Account;NEG-5P-1',
    '20/02/2026;VALE3;VENDA;50;72,10;2,50;BRL;XP;Test Account;NEG-5P-2',
  ].join('\n');

  async function seedAssets(): Promise<void> {
    for (const [ticker, name] of [
      ['PETR4', 'Petróleo Brasileiro S.A.'],
      ['VALE3', 'Vale S.A.'],
      ['HGLG11', 'Fundo Sintético HGL'],
    ] as const) {
      const asset = await prisma.asset.create({
        data: { ticker, name, type: 'STOCK', currency: 'BRL', exchange: 'B3' },
      });
      assetIds.set(ticker, asset.id);
    }
  }

  function previewUrl(): string {
    return `/api/v1/portfolios/${portfolioId}/imports/preview`;
  }

  function confirmUrl(): string {
    return `/api/v1/portfolios/${portfolioId}/imports/confirm`;
  }

  function runsUrl(query = ''): string {
    return `/api/v1/portfolios/${portfolioId}/imports/runs${query}`;
  }

  function previewBody(content: string) {
    return {
      sourceType: 'GENERIC_CSV',
      provider: 'XP',
      fileName: 'ops.csv',
      content,
      defaultAccountId: accountId,
    };
  }

  async function ledgerCount(): Promise<number> {
    return prisma.transaction.count({ where: { portfolioId } });
  }

  async function loadExisting(): Promise<ExistingLedgerRow[]> {
    const transactions = await prisma.transaction.findMany({ where: { portfolioId } });
    return transactions.map((transaction) => {
      const tradeDate = transaction.tradeDate.toISOString().slice(0, 10);
      const amount = transaction.amount?.toString() ?? null;
      const isIncome =
        transaction.type === 'DIVIDEND' ||
        transaction.type === 'JCP' ||
        transaction.type === 'FII_INCOME';
      return {
        provider: transaction.provider ?? null,
        externalId: transaction.externalId ?? null,
        assetId: transaction.assetId ?? '',
        accountId: transaction.accountId,
        type: transaction.type,
        tradeDate,
        quantity: transaction.quantity?.toString() ?? '',
        unitPrice: transaction.unitPrice?.toString() ?? null,
        fees: transaction.fees?.toString() ?? null,
        amount,
        currency: transaction.currency,
        fingerprint: isIncome
          ? canonicalIncomeFingerprint({
              portfolioId: transaction.portfolioId,
              accountId: transaction.accountId,
              assetId: transaction.assetId ?? '',
              type: transaction.type,
              tradeDate,
              amount,
              currency: transaction.currency,
            })
          : canonicalFingerprint({
              portfolioId: transaction.portfolioId,
              accountId: transaction.accountId,
              assetId: transaction.assetId ?? '',
              type: transaction.type,
              tradeDate,
              quantity: transaction.quantity?.toString() ?? '',
              unitPrice: transaction.unitPrice?.toString() ?? null,
              fees: transaction.fees?.toString() ?? null,
              currency: transaction.currency,
            }),
      };
    });
  }

  function toB3Commands(result: Parameters<typeof selectImportableCandidates>[0]) {
    return selectImportableCandidates(result).map((candidate) => ({
      portfolioId,
      userId,
      accountId: candidate.accountId!,
      assetId: candidate.assetId!,
      type: candidate.operation,
      currency: candidate.currency,
      tradeDate: candidate.tradeDate,
      ...(candidate.settlementDate ? { settlementDate: candidate.settlementDate } : {}),
      source: 'B3' as const,
      provider: candidate.provider,
      externalId: candidate.externalId,
      notes: `Sincronização B3 simulada (linha ${candidate.rowNumber})`,
      ...(candidate.operation === 'DIVIDEND' ||
      candidate.operation === 'JCP' ||
      candidate.operation === 'FII_INCOME'
        ? { amount: candidate.amount! }
        : { quantity: candidate.quantity }),
      ...(candidate.operation === 'BUY' || candidate.operation === 'SELL'
        ? {
            unitPrice: candidate.unitPrice,
            ...(candidate.fees !== '0' ? { fees: candidate.fees } : {}),
          }
        : {}),
      ...(candidate.transferGroupId ? { transferGroupId: candidate.transferGroupId } : {}),
    }));
  }

  async function linkRunTransactions(runId: string, transactionIds: string[]): Promise<void> {
    const service = app.get(IntegrationRunService);
    await service.linkTransactions(runId, portfolioId, userId, transactionIds);
  }

  async function linkedTransactionIds(runId: string): Promise<string[]> {
    const rows = await prisma.integrationRunTransaction.findMany({
      where: { runId, portfolioId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => row.transactionId);
  }

  async function b3Refs() {
    return {
      assets: [...assetIds.entries()].map(([ticker, id]) => ({
        id,
        ticker,
        exchange: 'B3',
        status: 'ACTIVE',
      })),
      accounts: [{ id: accountId, name: 'CONTA SINTETICA 5P' }],
    };
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    userId = fixtures.userId;
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;
    const session = await createAuthenticatedUserSession(userId);
    authToken = session.token;
    assetIds.clear();
    await seedAssets();
    await prisma.account.update({
      where: { id: accountId },
      data: { name: 'CONTA SINTETICA 5P' },
    });
  });

  it('CSV preview opens a run, writes zero ledger rows, and confirm completes it', async () => {
    const preview = await request(app.getHttpServer())
      .post(previewUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(previewBody(CSV));
    expect(preview.status).toBe(200);
    const runId = preview.body.data.runId as string;
    expect(runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await ledgerCount()).toBe(0);

    const runs = await request(app.getHttpServer())
      .get(runsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(runs.status).toBe(200);
    expect(runs.body.data).toHaveLength(1);
    expect(runs.body.data[0]).toMatchObject({
      id: runId,
      source: 'CSV',
      status: 'AWAITING_REVIEW',
      counts: { new: 2, exactDuplicates: 0, unsupported: 0, invalid: 0 },
    });

    const confirm = await request(app.getHttpServer())
      .post(confirmUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ...previewBody(CSV), runId, decisions: [] });
    expect(confirm.status).toBe(201);
    expect(confirm.body.data.created).toBe(2);

    const stamped = await prisma.transaction.findMany({ where: { portfolioId } });
    expect(stamped).toHaveLength(2);
    expect((await linkedTransactionIds(runId)).sort()).toEqual(stamped.map((tx) => tx.id).sort());

    const detail = await request(app.getHttpServer())
      .get(runsUrl(`/${runId}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      status: 'COMPLETED',
      counts: { confirmed: 2, ignored: 0 },
    });
    expect(detail.body.data.reconciliation).toBeNull();
  });

  it('confirm without runId preserves legacy behavior (no run linkage)', async () => {
    const preview = await request(app.getHttpServer())
      .post(previewUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(previewBody(CSV));
    expect(preview.status).toBe(200);

    const confirm = await request(app.getHttpServer())
      .post(confirmUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ...previewBody(CSV), decisions: [] });
    expect(confirm.status).toBe(201);
    expect(confirm.body.data.created).toBe(2);
    expect(await prisma.integrationRunTransaction.count()).toBe(0);
  });

  it('confirm with a spent runId fails closed without new writes', async () => {
    const preview = await request(app.getHttpServer())
      .post(previewUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(previewBody(CSV));
    const runId = preview.body.data.runId as string;
    const first = await request(app.getHttpServer())
      .post(confirmUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ...previewBody(CSV), runId, decisions: [] });
    expect(first.status).toBe(201);
    expect(await ledgerCount()).toBe(2);

    const second = await request(app.getHttpServer())
      .post(confirmUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ...previewBody(CSV), runId, decisions: [] });
    expect(second.status).toBe(400);
    expect(await ledgerCount()).toBe(2);
  });

  it('mixed CSV records unsupported/invalid counts and confirms only the ready row', async () => {
    const mixed = [
      'data;ticker;operacao;quantidade;preco_unitario;taxas;moeda;corretora;conta;external_id',
      '15/01/2026;PETR4;COMPRA;100;38,50;4,90;BRL;XP;Test Account;NEG-1',
      '12/05/2026;PETR4;DIVIDENDO;100;0;0;BRL;;;;',
    ].join('\n');
    const preview = await request(app.getHttpServer())
      .post(previewUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(previewBody(mixed));
    expect(preview.status).toBe(200);
    expect(preview.body.data.summary).toMatchObject({ ready: 1, unsupported: 1 });

    const confirm = await request(app.getHttpServer())
      .post(confirmUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ...previewBody(mixed), runId: preview.body.data.runId, decisions: [] });
    expect(confirm.status).toBe(201);
    expect(confirm.body.data.created).toBe(1);
    const detail = await request(app.getHttpServer())
      .get(runsUrl(`/${preview.body.data.runId}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.body.data.counts).toMatchObject({ confirmed: 1, unsupported: 1, ignored: 1 });
  });

  it('B3 simulated sync lifecycle: run, preview, confirm, reconcile, complete', async () => {
    const service = app.get(IntegrationRunService);
    const useCase = app.get(CreateTransactionUseCase);
    const refs = await b3Refs();

    const run = await service.startRun({
      portfolioId,
      userId,
      source: 'B3',
      provider: 'B3',
      environment: 'SIMULATED',
    });
    const sync = runSimulatedB3Sync({
      syncState: 'AUTHORIZED',
      provider: new SimulatedB3Provider({ scenario: 'SNAPSHOT_1' }),
      portfolioId,
      assets: refs.assets,
      accounts: refs.accounts,
      defaultAccountId: accountId,
      existing: await loadExisting(),
      ledgerPositions: [],
      today: '2026-06-30',
      lastSuccessfulSyncAt: null,
    });
    expect(sync.newCandidates).toBe(5);
    await service.recordPreview({
      runId: run.id,
      portfolioId,
      userId,
      recordsFetched: sync.recordsFetched,
      recordsNormalized: sync.normalized,
      newCandidates: sync.newCandidates,
      exactDuplicates: sync.exactDuplicates,
      probableDuplicates: sync.probableDuplicates,
      conflicts: sync.conflicts,
      unsupported: sync.unsupported,
      invalid: sync.invalid,
      sourceAsOf: sync.sourceAsOf,
    });

    const created = await useCase.executeMany(toB3Commands(sync));
    expect(created).toHaveLength(5);
    await linkRunTransactions(
      run.id,
      created.map((tx) => tx.id),
    );

    const state = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(state.status).toBe(200);
    const ledgerPositions = (
      state.body.data.positions as Array<{ assetId: string; quantity: string }>
    ).map((position) => ({ assetId: position.assetId, quantity: position.quantity }));
    const provider = new SimulatedB3Provider({ scenario: 'SNAPSHOT_1' });
    const snapshot = provider.getPositions();
    const snapshotRows = snapshot.records.map((row) => ({
      assetId: assetIds.get(row.ticker)!,
      ticker: row.ticker,
      quantity: row.quantity,
      asOf: snapshot.asOf,
    }));
    const { summary } = reconcilePositions(ledgerPositions, snapshotRows);

    await service.recordConfirmation({
      runId: run.id,
      portfolioId,
      userId,
      status: summary.divergent === 0 ? 'COMPLETED' : 'PARTIAL',
      confirmed: created.length,
      ignored: sync.exactDuplicates,
      partial: false,
      reconciliation: {
        matched: summary.matched,
        divergent: summary.divergent,
        missingLocal: summary.missingLocal,
        missingSource: summary.missingSource,
        unresolved: summary.unresolved,
      },
      sourceAsOf: sync.sourceAsOf,
    });

    const detail = await request(app.getHttpServer())
      .get(runsUrl(`/${run.id}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      source: 'B3',
      environment: 'SIMULATED',
      sourceAsOf: '2026-04-30',
      status: 'COMPLETED',
      counts: { new: 5, exactDuplicates: 0, confirmed: 5, ignored: 0 },
      reconciliation: {
        matched: 3,
        divergent: 0,
        missingLocal: 0,
        missingSource: 0,
        unresolved: 0,
      },
    });
    const stamped = await prisma.transaction.findMany({ where: { portfolioId } });
    expect(stamped).toHaveLength(5);
    expect((await linkedTransactionIds(run.id)).sort()).toEqual(stamped.map((tx) => tx.id).sort());
  });

  it('repeated B3 sync creates a new run but writes zero ledger rows', async () => {
    const service = app.get(IntegrationRunService);
    const useCase = app.get(CreateTransactionUseCase);
    const refs = await b3Refs();

    const first = await service.startRun({
      portfolioId,
      userId,
      source: 'B3',
      provider: 'B3',
      environment: 'SIMULATED',
    });
    const sync1 = runSimulatedB3Sync({
      syncState: 'AUTHORIZED',
      provider: new SimulatedB3Provider({ scenario: 'SNAPSHOT_1' }),
      portfolioId,
      assets: refs.assets,
      accounts: refs.accounts,
      defaultAccountId: accountId,
      existing: await loadExisting(),
      ledgerPositions: [],
      today: '2026-06-30',
      lastSuccessfulSyncAt: null,
    });
    await useCase.executeMany(toB3Commands(sync1));
    await linkRunTransactions(
      first.id,
      (await prisma.transaction.findMany({ where: { portfolioId } })).map((tx) => tx.id),
    );

    const second = await service.startRun({
      portfolioId,
      userId,
      source: 'B3',
      provider: 'B3',
      environment: 'SIMULATED',
    });
    const sync2 = runSimulatedB3Sync({
      syncState: 'AUTHORIZED',
      provider: new SimulatedB3Provider({ scenario: 'SNAPSHOT_1' }),
      portfolioId,
      assets: refs.assets,
      accounts: refs.accounts,
      defaultAccountId: accountId,
      existing: await loadExisting(),
      ledgerPositions: [],
      today: '2026-06-30',
      lastSuccessfulSyncAt: null,
    });
    expect(sync2.newCandidates).toBe(0);
    const created = await useCase.executeMany(toB3Commands(sync2));
    expect(created).toHaveLength(0);
    await service.recordPreview({
      runId: second.id,
      portfolioId,
      userId,
      recordsFetched: sync2.recordsFetched,
      recordsNormalized: sync2.normalized,
      newCandidates: sync2.newCandidates,
      exactDuplicates: sync2.exactDuplicates,
      probableDuplicates: sync2.probableDuplicates,
      conflicts: sync2.conflicts,
      unsupported: sync2.unsupported,
      invalid: sync2.invalid,
    });
    await service.recordConfirmation({
      runId: second.id,
      portfolioId,
      userId,
      status: 'COMPLETED',
      confirmed: 0,
      ignored: sync2.exactDuplicates,
      partial: false,
    });

    expect(await ledgerCount()).toBe(5);
    const detail = await request(app.getHttpServer())
      .get(runsUrl(`/${second.id}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(detail.body.data.counts).toMatchObject({ confirmed: 0, exactDuplicates: 5 });
  });

  it('failure and partial outcomes are auditable and terminal', async () => {
    const service = app.get(IntegrationRunService);
    const failed = await service.startRun({ portfolioId, userId, source: 'B3', provider: 'B3' });
    await service.recordFailure({
      runId: failed.id,
      portfolioId,
      userId,
      errorCode: 'B3_TRANSPORT.UPSTREAM_UNAVAILABLE',
      errorMessage: 'B3 upstream unavailable',
    });
    const failedDetail = await request(app.getHttpServer())
      .get(runsUrl(`/${failed.id}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(failedDetail.body.data).toMatchObject({
      status: 'FAILED',
      error: { code: 'B3_TRANSPORT.UPSTREAM_UNAVAILABLE', message: 'B3 upstream unavailable' },
    });

    const partial = await service.startRun({ portfolioId, userId, source: 'B3', provider: 'B3' });
    await service.recordPreview({
      runId: partial.id,
      portfolioId,
      userId,
      recordsFetched: 3,
      recordsNormalized: 3,
      newCandidates: 1,
      exactDuplicates: 2,
      probableDuplicates: 0,
      conflicts: 0,
      unsupported: 0,
      invalid: 0,
    });
    await service.recordConfirmation({
      runId: partial.id,
      portfolioId,
      userId,
      status: 'PARTIAL',
      confirmed: 1,
      ignored: 2,
      partial: true,
    });
    const partialDetail = await request(app.getHttpServer())
      .get(runsUrl(`/${partial.id}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(partialDetail.body.data).toMatchObject({ status: 'PARTIAL', partial: true });
  });

  it('run history isolates portfolios and paginates newest-first', async () => {
    const first = await request(app.getHttpServer())
      .post(previewUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(previewBody(CSV));
    const second = await request(app.getHttpServer())
      .post(previewUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(previewBody(CSV));
    expect(first.body.data.runId).not.toBe(second.body.data.runId);

    const page1 = await request(app.getHttpServer())
      .get(runsUrl('?limit=1'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(1);
    expect(page1.body.meta).toMatchObject({ limit: 1, hasMore: true });
    expect(page1.body.meta.nextCursor).toBe(page1.body.data[0].id);

    const page2 = await request(app.getHttpServer())
      .get(runsUrl(`?limit=1&cursor=${page1.body.meta.nextCursor}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta.hasMore).toBe(false);
    expect([page1.body.data[0].id, page2.body.data[0].id].sort()).toEqual(
      [first.body.data.runId, second.body.data.runId].sort(),
    );

    const badCursor = await request(app.getHttpServer())
      .get(runsUrl('?cursor=00000000-0000-4000-8000-000000000000'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(badCursor.status).toBe(404);

    const otherUser = await prisma.user.create({
      data: {
        id: '99999999-9999-4999-8999-999999999999',
        email: 'other@atlas.dev',
        name: 'Other',
        passwordHash: 'x',
      },
    });
    const otherSession = await createAuthenticatedUserSession(otherUser.id);
    const foreign = await request(app.getHttpServer())
      .get(runsUrl())
      .set('Authorization', `Bearer ${otherSession.token}`);
    // Anti-enumeration: another investor's portfolio id resolves to 404,
    // never to an empty list that would confirm/deny existence differently.
    expect(foreign.status).toBe(404);
    const foreignDetail = await request(app.getHttpServer())
      .get(runsUrl(`/${first.body.data.runId}`))
      .set('Authorization', `Bearer ${otherSession.token}`);
    expect(foreignDetail.status).toBe(404);
  });

  it('run records never carry secrets, tokens, payloads or PII-adjacent material', async () => {
    const preview = await request(app.getHttpServer())
      .post(previewUrl())
      .set('Authorization', `Bearer ${authToken}`)
      .send(previewBody(CSV));
    const detail = await request(app.getHttpServer())
      .get(runsUrl(`/${preview.body.data.runId}`))
      .set('Authorization', `Bearer ${authToken}`);
    const serialized = JSON.stringify(detail.body.data);
    expect(serialized).not.toMatch(
      /token|secret|password|certificate|private|payload|cpf|cnpj|fingerprint|externalId/i,
    );
    expect(Object.keys(detail.body.data).sort()).toEqual(
      expect.arrayContaining(['source', 'provider', 'status', 'counts', 'reconciliation']),
    );
  });

  it('returns an explicit empty history for fresh portfolios', async () => {
    const res = await request(app.getHttpServer())
      .get(runsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({ hasMore: false, nextCursor: null });
  });
});
