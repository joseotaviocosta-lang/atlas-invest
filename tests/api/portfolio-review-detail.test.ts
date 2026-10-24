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
 * Phase 5Q-B — review signal drill-down end-to-end (real DB, real API).
 *
 * Covers lazy detail per stable code: current evidence identical to the
 * overview, ownership isolation, unknown codes, invalid periods, default
 * and explicit presets, bounded history, inactive-signal behavior, no
 * internal-id leakage and determinism. Zero migrations, zero advice.
 */
describe('API Integration: portfolio review drill-down (Phase 5Q-B)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function detailUrl(code: string, query = '', id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/review/signals/${code}${query}`;
  }

  function overviewUrl(id: string = portfolioId): string {
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
      createdAt?: Date;
      reconciliation?: { divergent: number; missingLocal: number } | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    const now = overrides.createdAt ?? new Date();
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

  it('reads an active concentration drill-down with identical overview evidence', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QB-1');
    await seedQuote(petr4.id, '37.00');

    const overview = await request(app.getHttpServer())
      .get(overviewUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(overview.status).toBe(200);
    const overviewSignal = overview.body.data.signals.find(
      (item: { code: string }) => item.code === 'ALLOCATION_SINGLE_ASSET_CONCENTRATION',
    );
    expect(overviewSignal).toBeDefined();

    const res = await request(app.getHttpServer())
      .get(detailUrl('ALLOCATION_SINGLE_ASSET_CONCENTRATION'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe('ALLOCATION_SINGLE_ASSET_CONCENTRATION');
    expect(res.body.data.state).toBe('ACTIVE');
    expect(res.body.data.period.preset).toBe('1A');
    expect(res.body.data.evidence).toEqual(overviewSignal.evidence);
    expect(res.body.data.history.kind).toBe('UNAVAILABLE');
    expect(res.body.data.limitations).toContain('NO_HISTORICAL_SOURCE');
    expect(res.body.data.action).toMatchObject({ kind: 'ROUTE', label: 'Ver alocação' });
  });

  it('returns 404 for foreign portfolios and unknown codes', async () => {
    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5qb@atlas.dev', name: 'Stranger', passwordHash: 'x' },
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
    const forbidden = await request(app.getHttpServer())
      .get(detailUrl('ALLOCATION_SINGLE_ASSET_CONCENTRATION', '', strangerPortfolio))
      .set('Authorization', `Bearer ${authToken}`);
    expect(forbidden.status).toBe(404);

    const unknown = await request(app.getHttpServer())
      .get(detailUrl('NOPE_NOT_A_SIGNAL'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(unknown.status).toBe(404);
  });

  it('rejects invalid periods with 400 and accepts every preset', async () => {
    const bad = await request(app.getHttpServer())
      .get(detailUrl('INTEGRATION_PENDING_REVIEW', '?period=CUSTOM'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(bad.status).toBe(400);

    for (const preset of ['1M', '3M', '6M', 'YTD', '1A', 'INCEPTION']) {
      const res = await request(app.getHttpServer())
        .get(detailUrl('INTEGRATION_PENDING_REVIEW', `?period=${preset}`))
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.period.preset).toBe(preset);
      expect(res.body.data.period.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.body.data.period.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('returns NOT_ACTIVE with history for signals not currently firing', async () => {
    await seedRun({ status: 'AWAITING_REVIEW', newCandidates: 4 });
    await seedRun({
      status: 'AWAITING_REVIEW',
      newCandidates: 0,
      reconciliation: { divergent: 2, missingLocal: 1 },
    });

    const res = await request(app.getHttpServer())
      .get(detailUrl('ALLOCATION_SINGLE_ASSET_CONCENTRATION'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.state).toBe('NOT_ACTIVE');
    expect(res.body.data.evidence).toBeNull();
    expect(res.body.data.history.kind).toBe('UNAVAILABLE');

    const runs = await request(app.getHttpServer())
      .get(detailUrl('DATA_RECONCILIATION_DIVERGENCE'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(runs.body.data.state).toBe('ACTIVE');
    expect(runs.body.data.history.kind).toBe('TABLE_RUNS');
    expect(runs.body.data.history.rows.length).toBeGreaterThan(0);
    expect(runs.body.data.history.firstDivergenceAt).not.toBeNull();
  });

  it('shows income history by month without inventing months', async () => {
    const res = await request(app.getHttpServer())
      .get(detailUrl('INCOME_RECEIVED'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    // No income events seeded: honest empty grouped history, not fabricated rows.
    expect(res.body.data.history.kind).toBe('GROUPED');
    expect(res.body.data.history.groups).toEqual([]);
    expect(res.body.data.state).toBe('NOT_ACTIVE');
  });

  it('caps run history at 20 rows even with many runs', async () => {
    for (let index = 0; index < 25; index += 1) {
      await seedRun({ status: 'AWAITING_REVIEW', newCandidates: index === 0 ? 4 : 0 });
    }
    const res = await request(app.getHttpServer())
      .get(detailUrl('INTEGRATION_PENDING_REVIEW'))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.history.kind).toBe('TABLE_RUNS');
    expect(res.body.data.history.rows.length).toBeLessThanOrEqual(20);
  });

  it('exposes no internal ids and returns deterministic responses', async () => {
    const petr4 = await createAsset('PETR4');
    await buy(petr4.id, '100', '30.00', 'NEG-5QB-2');
    await seedQuote(petr4.id, '37.00');
    await seedRun({ status: 'AWAITING_REVIEW', newCandidates: 2 });

    const first = await request(app.getHttpServer())
      .get(detailUrl('ALLOCATION_SINGLE_ASSET_CONCENTRATION'))
      .set('Authorization', `Bearer ${authToken}`);
    const second = await request(app.getHttpServer())
      .get(detailUrl('ALLOCATION_SINGLE_ASSET_CONCENTRATION'))
      .set('Authorization', `Bearer ${authToken}`);
    const { generatedAt: _first, ...firstRest } = first.body.data;
    const { generatedAt: _second, ...secondRest } = second.body.data;
    void _first;
    void _second;
    expect(secondRest).toEqual(firstRest);
    const payload = JSON.stringify(first.body.data);
    expect(payload).not.toMatch(/fingerprint|externalId|providerSymbol|secret|token|password/i);
    expect(first.body.data.evidence).not.toHaveProperty('assetId');
  });
});
