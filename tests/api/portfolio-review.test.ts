import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
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
import { Asset } from '@atlas/domain';

/**
 * Phase 5Q-A — portfolio review read model end-to-end (real DB, real API).
 *
 * Covers the aggregated GET /api/v1/portfolios/:id/review surface:
 * ownership isolation, empty portfolios, concentration signals, partial
 * coverage, pending reviews, reconciliation divergence, deterministic
 * responses and no internal-id leakage. Zero migrations, zero advice,
 * no B3 calls.
 */
describe('API Integration: portfolio review (Phase 5Q-A)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function reviewUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/review`;
  }

  async function createAsset(ticker: string) {
    const asset = Asset.create({
      ticker,
      name: `${ticker} S.A.`,
      type: 'STOCK' as never,
      currency: 'BRL',
      exchange: 'B3',
    });
    await prisma.asset.create({
      data: {
        id: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        type: asset.type,
        currency: asset.currency,
        exchange: asset.exchange,
      },
    });
    return asset;
  }

  async function buy(assetId: string, quantity: string, unitPrice: string, externalId: string) {
    const total = (Number(quantity) * Number(unitPrice)).toFixed(2);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        quantity,
        unitPrice,
        totalAmount: total,
        currency: 'BRL',
        tradeDate: '2026-03-01',
        provider: 'B3',
        externalId,
      });
    expect(res.status).toBe(201);
  }

  async function seedQuote(assetId: string, close: string) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    await prisma.marketQuoteRecord.create({
      data: {
        assetId,
        tradingDate: new Date(`${today}T00:00:00.000Z`),
        currency: 'BRL',
        close,
        provider: 'BRAPI',
        providerSymbol: 'TEST',
        firstFetchedAt: new Date(),
        lastFetchedAt: new Date(),
        fetchCount: 1,
      },
    });
  }

  async function seedRun(
    overrides: {
      status?: string;
      newCandidates?: number;
      partial?: boolean;
      reconciliation?: { divergent: number; missingLocal: number } | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    const now = new Date();
    await prisma.integrationRun.create({
      data: {
        id,
        portfolioId,
        source: 'B3',
        provider: 'B3',
        environment: 'SIMULATED',
        status: overrides.status ?? 'AWAITING_REVIEW',
        recordsFetched: 5,
        recordsNormalized: 5,
        newCandidates: overrides.newCandidates ?? 0,
        exactDuplicates: 0,
        probableDuplicates: 0,
        conflicts: 0,
        unsupported: 0,
        invalid: 0,
        confirmed: 0,
        ignored: 0,
        reconciliationMatched: null,
        reconciliationDivergent: overrides.reconciliation?.divergent ?? null,
        reconciliationMissingLocal: overrides.reconciliation?.missingLocal ?? null,
        reconciliationMissingSource: null,
        reconciliationUnresolved: null,
        partial: overrides.partial ?? false,
        errorCode: null,
        errorMessage: null,
        trigger: 'SCHEDULED',
        createdAt: now,
        updatedAt: now,
      },
    });
    return id;
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
  });

  it('reads an empty review for a portfolio with no positions', async () => {
    const res = await request(app.getHttpServer())
      .get(reviewUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.portfolioId).toBe(portfolioId);
    expect(res.body.data.isEmpty).toBe(true);
    expect(res.body.data.signals).toEqual([]);
    expect(res.body.data.summary.attentionCount).toBe(0);
    expect(res.body.data.asOf.generatedAt).toBeDefined();
  });

  it('returns 404 for a foreign portfolio (never 403)', async () => {
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5qa@atlas.dev', name: 'Stranger', passwordHash: 'x' },
    });
    await prisma.portfolio.create({
      data: {
        id: strangerPortfolio,
        userId: stranger,
        name: 'Stranger Portfolio',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    const res = await request(app.getHttpServer())
      .get(reviewUrl(strangerPortfolio))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(404);
  });

  it('flags single-asset concentration with evidence and a real CTA', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QA-1');
    await seedQuote(petr4.id, '37.00');

    const res = await request(app.getHttpServer())
      .get(reviewUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isEmpty).toBe(false);
    const signal = res.body.data.signals.find(
      (item: { code: string }) => item.code === 'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
    );
    expect(signal).toBeDefined();
    expect(signal.severity).toBe('REVIEW');
    expect(signal.evidence.weightPercent).toBe('100');
    expect(signal.evidence.thresholdPercent).toBe('25');
    expect(signal.evidence.ticker).toBe('PETR4');
    expect(signal.action).toMatchObject({ kind: 'ROUTE', label: 'Ver alocação' });
    expect(signal.action.href).toContain('/portfolio?tab=allocation');
  });

  it('marks partial valuation coverage and qualifies dependent data', async () => {
    const petr4 = await createAsset('PETR4');
    const vale3 = await createAsset('VALE3');
    await buy(petr4.id, '100', '30.00', 'NEG-5QA-2');
    await buy(vale3.id, '100', '70.00', 'NEG-5QA-3');
    await seedQuote(petr4.id, '37.00');

    const res = await request(app.getHttpServer())
      .get(reviewUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const coverage = res.body.data.signals.find(
      (item: { code: string }) => item.code === 'DATA_VALUATION_COVERAGE',
    );
    expect(coverage).toBeDefined();
    expect(res.body.data.summary.dataNote).not.toBeNull();
    expect(res.body.data.dataQuality.missingPrices).toBeGreaterThan(0);
  });

  it('aggregates pending reviews and reconciliation divergence', async () => {
    await seedRun({ status: 'AWAITING_REVIEW', newCandidates: 4 });
    await seedRun({
      status: 'AWAITING_REVIEW',
      newCandidates: 0,
      reconciliation: { divergent: 2, missingLocal: 1 },
    });

    const res = await request(app.getHttpServer())
      .get(reviewUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const pending = res.body.data.signals.find(
      (item: { code: string }) => item.code === 'INTEGRATION_PENDING_REVIEW',
    );
    expect(pending?.evidence.pendingReviewCount).toBeGreaterThanOrEqual(1);
    expect(pending?.action.href).toContain('/reviews');
    const recon = res.body.data.signals.find(
      (item: { code: string }) => item.code === 'DATA_RECONCILIATION_DIVERGENCE',
    );
    expect(recon?.severity).toBe('WARNING');
    expect(recon?.evidence.divergent).toBe(2);
  });

  it('returns deterministic responses with stable signal ids', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QA-4');
    await seedQuote(petr4.id, '37.00');

    const first = await request(app.getHttpServer())
      .get(reviewUrl())
      .set('Authorization', `Bearer ${authToken}`);
    const second = await request(app.getHttpServer())
      .get(reviewUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(second.body.data.signals).toEqual(first.body.data.signals);
    for (const signal of second.body.data.signals as Array<{ id: string; code: string }>) {
      expect(signal.id).toBe(signal.code);
    }
  });

  it('exposes no internal ids, fingerprints or provider internals', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QA-5');
    await seedQuote(petr4.id, '37.00');
    await seedRun({ status: 'AWAITING_REVIEW', newCandidates: 2 });

    const res = await request(app.getHttpServer())
      .get(reviewUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const payload = JSON.stringify(res.body.data);
    expect(payload).not.toMatch(
      /fingerprint|externalId|providerSymbol|private|secret|token|password|certificate/i,
    );
    for (const signal of res.body.data.signals as Array<{ evidence: Record<string, unknown> }>) {
      expect(signal.evidence).not.toHaveProperty('assetId');
    }
  });
});
