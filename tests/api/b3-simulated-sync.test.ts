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
import {
  SimulatedB3Provider,
  runSimulatedB3Sync,
  selectImportableCandidates,
  canonicalFingerprint,
  reconcilePositions,
  type ExistingLedgerRow,
} from '@atlas/import-engine';

/**
 * Phase 5M — simulated B3 sync against the REAL ledger and REAL read models.
 *
 * No new endpoint, no network: the orchestrator (pure) classifies through
 * the canonical pipeline and confirms through the single canonical writer
 * (`CreateTransactionUseCase.executeMany`); positions are read back through
 * the frozen Portfolio read API (`GET /state`).
 */
describe('API Integration: Simulated B3 Sync (Phase 5M, no network, real ledger)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountAId: string;
  let accountBId: string;
  let userId: string;
  const prisma = getTestPrismaClient();
  const assetIds = new Map<string, string>();

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

  async function loadExisting(): Promise<ExistingLedgerRow[]> {
    const transactions = await prisma.transaction.findMany({ where: { portfolioId } });
    return transactions.map((transaction) => ({
      provider: transaction.provider ?? null,
      externalId: transaction.externalId ?? null,
      assetId: transaction.assetId ?? '',
      accountId: transaction.accountId,
      type: transaction.type,
      tradeDate: transaction.tradeDate.toISOString().slice(0, 10),
      quantity: transaction.quantity.toString(),
      unitPrice: transaction.unitPrice?.toString() ?? null,
      fees: transaction.fees?.toString() ?? null,
      currency: transaction.currency,
      fingerprint: canonicalFingerprint({
        portfolioId: transaction.portfolioId,
        accountId: transaction.accountId,
        assetId: transaction.assetId ?? '',
        type: transaction.type,
        tradeDate: transaction.tradeDate.toISOString().slice(0, 10),
        quantity: transaction.quantity.toString(),
        unitPrice: transaction.unitPrice?.toString() ?? null,
        fees: transaction.fees?.toString() ?? null,
        currency: transaction.currency,
      }),
    }));
  }

  function toCommands(result: Parameters<typeof selectImportableCandidates>[0]) {
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
      quantity: candidate.quantity,
      ...(candidate.operation === 'BUY' || candidate.operation === 'SELL'
        ? {
            unitPrice: candidate.unitPrice,
            ...(candidate.fees !== '0' ? { fees: candidate.fees } : {}),
          }
        : {}),
      ...(candidate.transferGroupId ? { transferGroupId: candidate.transferGroupId } : {}),
    }));
  }

  async function syncAndConfirm(scenario: 'SNAPSHOT_1' | 'SNAPSHOT_2') {
    const useCase = app.get(CreateTransactionUseCase);
    const result = runSimulatedB3Sync({
      syncState: 'AUTHORIZED',
      provider: new SimulatedB3Provider({ scenario }),
      portfolioId,
      assets: [...assetIds.entries()].map(([ticker, id]) => ({
        id,
        ticker,
        exchange: 'B3',
        status: 'ACTIVE',
      })),
      accounts: [
        { id: accountAId, name: 'CONTA SINTETICA 5M-A' },
        { id: accountBId, name: 'CONTA SINTETICA 5M-B' },
      ],
      defaultAccountId: accountAId,
      existing: await loadExisting(),
      ledgerPositions: [],
      today: '2026-06-30',
      lastSuccessfulSyncAt: null,
    });
    const created = await useCase.executeMany(toCommands(result));
    return { result, created };
  }

  async function stateQuantities(): Promise<Record<string, string>> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const quantities: Record<string, string> = {};
    for (const position of res.body.data.positions as Array<{
      assetId: string;
      quantity: string;
    }>) {
      quantities[position.assetId] = position.quantity;
    }
    return quantities;
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
    const session = await createAuthenticatedUserSession(userId);
    authToken = session.token;
    assetIds.clear();
    await seedAssets();

    const institution = await prisma.institution.create({
      data: { name: 'Custodiante Sintético', type: 'CUSTODIAN', country: 'BR' },
    });
    const accountA = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: institution.id,
        name: 'CONTA SINTETICA 5M-A',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    const accountB = await prisma.account.create({
      data: {
        portfolioId,
        institutionId: institution.id,
        name: 'CONTA SINTETICA 5M-B',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });
    accountAId = accountA.id;
    accountBId = accountB.id;
  });

  it('initial sync writes snapshot-1 trades through the real writer; /state derives 100/50/10', async () => {
    const { result, created } = await syncAndConfirm('SNAPSHOT_1');
    expect(result.newCandidates).toBe(3);
    expect(created).toHaveLength(3);
    expect(created.every((tx) => tx.provider === 'B3')).toBe(true);

    const quantities = await stateQuantities();
    expect(quantities[assetIds.get('PETR4')!]).toBe('100');
    expect(quantities[assetIds.get('VALE3')!]).toBe('50');
    expect(quantities[assetIds.get('HGLG11')!]).toBe('10');
  });

  it('second sync is idempotent, incremental sync adds only new events, third is silent', async () => {
    await syncAndConfirm('SNAPSHOT_1');

    const repeat = await syncAndConfirm('SNAPSHOT_1');
    expect(repeat.result.newCandidates).toBe(0);
    expect(repeat.created).toHaveLength(0);

    const incremental = await syncAndConfirm('SNAPSHOT_2');
    expect(incremental.result.newCandidates).toBe(4);
    expect(incremental.created).toHaveLength(4);

    const quantities = await stateQuantities();
    expect(quantities[assetIds.get('PETR4')!]).toBe('120');
    expect(quantities[assetIds.get('VALE3')!]).toBe('40');
    expect(quantities[assetIds.get('HGLG11')!]).toBe('10');

    const silent = await syncAndConfirm('SNAPSHOT_2');
    expect(silent.result.newCandidates).toBe(0);
    expect(silent.created).toHaveLength(0);

    const total = await prisma.transaction.count({ where: { portfolioId } });
    expect(total).toBe(7);
  });

  it('transfer legs persist with the shared transferGroupId and reconcile MATCHED', async () => {
    await syncAndConfirm('SNAPSHOT_1');
    await syncAndConfirm('SNAPSHOT_2');

    const legs = await prisma.transaction.findMany({
      where: { portfolioId, type: { in: ['TRANSFER_IN', 'TRANSFER_OUT'] } },
      orderBy: { type: 'asc' },
    });
    expect(legs).toHaveLength(2);
    expect(legs[0]!.transferGroupId).toBe('B3-5M-TRF-001');
    expect(legs[1]!.transferGroupId).toBe('B3-5M-TRF-001');
    expect(legs.map((leg) => leg.source)).toEqual(['B3', 'B3']);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const ledgerPositions = (
      res.body.data.positions as Array<{ assetId: string; quantity: string }>
    )
      .map((position) => ({ assetId: position.assetId, quantity: position.quantity }))
      .sort((a, b) => a.assetId.localeCompare(b.assetId));

    const provider = new SimulatedB3Provider({ scenario: 'SNAPSHOT_2' });
    const snapshot = provider.getPositions();
    const snapshotRows = snapshot.records.map((row) => ({
      assetId: assetIds.get(row.ticker)!,
      ticker: row.ticker,
      quantity: row.quantity,
      asOf: snapshot.asOf,
    }));
    const { summary } = reconcilePositions(ledgerPositions, snapshotRows);
    expect(summary).toMatchObject({ matched: 3, divergent: 0 });
  });
});
