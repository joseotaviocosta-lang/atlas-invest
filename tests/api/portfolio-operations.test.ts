import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Asset } from '@atlas/domain';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
  seedBaseFixtures,
} from './setup';

/**
 * Phase 5S-A — portfolio operations center (read-only).
 *
 * Aggregates integration state, run history, review derivation,
 * reconciliation and 5R-E data quality into one operational view with
 * navigation actions. Zero writes, zero migrations, bounded reads.
 */
describe('API Integration: portfolio operations center (Phase 5S-A)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function opsUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/operations-center`;
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

  function todaySp(offsetDays = 0): string {
    const now = new Date();
    now.setDate(now.getDate() + offsetDays);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }

  function addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }

  let tickerSeq = 0;
  async function createAsset() {
    tickerSeq += 1;
    const ticker = `P5S${tickerSeq}`;
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

  async function buy(assetId: string, externalId: string, tradeDate: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        accountId,
        assetId,
        type: 'BUY',
        quantity: '100',
        unitPrice: '30.00',
        totalAmount: '3000.00',
        currency: 'BRL',
        tradeDate,
        provider: 'B3',
        externalId,
      });
    expect(res.status).toBe(201);
  }

  async function seedQuote(assetId: string, tradingDate: string) {
    await prisma.marketQuoteRecord.create({
      data: {
        assetId,
        tradingDate: new Date(`${tradingDate}T00:00:00.000Z`),
        currency: 'BRL',
        close: '38.50',
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
      source?: string;
      status?: string;
      newCandidates?: number;
      conflicts?: number;
      reconciliation?: {
        matched: number;
        divergent: number;
        missingLocal: number;
        missingSource: number;
        unresolved: number;
      } | null;
      createdAt?: Date;
    } = {},
  ) {
    await prisma.integrationRun.create({
      data: {
        id: randomUUID(),
        portfolioId,
        source: overrides.source ?? 'B3',
        provider: 'B3',
        environment: 'SIMULATED',
        status: overrides.status ?? 'COMPLETED',
        recordsFetched: 5,
        recordsNormalized: 5,
        newCandidates: overrides.newCandidates ?? 0,
        conflicts: overrides.conflicts ?? 0,
        confirmed: 0,
        ignored: 0,
        reconciliationMatched: overrides.reconciliation?.matched ?? null,
        reconciliationDivergent: overrides.reconciliation?.divergent ?? null,
        reconciliationMissingLocal: overrides.reconciliation?.missingLocal ?? null,
        reconciliationMissingSource: overrides.reconciliation?.missingSource ?? null,
        reconciliationUnresolved: overrides.reconciliation?.unresolved ?? null,
        trigger: 'MANUAL',
        createdAt: overrides.createdAt ?? new Date(),
        updatedAt: new Date(),
      },
    });
  }

  it('reports a clear state for a connected, clean portfolio', async () => {
    const asset = await createAsset();
    await buy(asset.id, `tx-5s-buy-${randomUUID()}`, addDays(todaySp(), -10));
    await seedQuote(asset.id, todaySp());

    const res = await request(app.getHttpServer())
      .get(opsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.portfolioId).toBe(portfolioId);
    expect(data.status).toBe('CLEAR');
    expect(data.attention).toEqual({ total: 0, preview: [] });
    expect(data.dataQuality.status).toBe('COMPLETE');
    expect(data.dataQuality.summary).toMatchObject({ positionsTotal: 1 });
    expect(data.reconciliation).toMatchObject({
      divergent: 0,
      missingLocal: 0,
      missingSource: 0,
      unresolved: 0,
      pendingReviews: 0,
      truncated: false,
    });
    expect(data.recentActivity).toEqual([]);
    expect(data.reviewPreview).toEqual([]);
    expect(data.availableActions.map((action: { type: string }) => action.type)).toEqual([
      'VIEW_REVIEWS',
      'VIEW_DATA_QUALITY',
      'VIEW_INTEGRATION_SETTINGS',
      'VIEW_RUN_HISTORY',
      'VIEW_IMPORT',
    ]);
    // B3 source exists in preparing state: structural, never attention.
    const b3 = data.integrations.find((row: { source: string }) => row.source === 'B3');
    expect(b3).toMatchObject({ provider: 'SIMULATED', environment: 'SIMULATED' });
    expect(typeof b3.status).toBe('string');
    expect(typeof b3.connectionState).toBe('string');
  });

  it('flags blocking data quality, failed runs and pending reviews with navigation', async () => {
    const asset = await createAsset();
    await buy(asset.id, `tx-5s-buy-b-${randomUUID()}`, addDays(todaySp(), -10));
    // No quote: blocking MISSING_PRICE.
    await seedRun({
      status: 'AWAITING_REVIEW',
      newCandidates: 2,
      reconciliation: {
        matched: 5,
        divergent: 2,
        missingLocal: 0,
        missingSource: 1,
        unresolved: 0,
      },
      createdAt: new Date(Date.now() - 3_600_000),
    });
    // Latest run failed: SYNC_FAILED reflects the newest outcome.
    await seedRun({ status: 'FAILED', newCandidates: 4, createdAt: new Date() });

    const res = await request(app.getHttpServer())
      .get(opsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.status).toBe('BLOCKED');
    const codes = data.attention.preview.map((item: { code: string }) => item.code);
    expect(codes).toContain('MISSING_PRICE');
    expect(codes).toContain('SYNC_FAILED');
    expect(codes).toContain('PENDING_REVIEWS');
    expect(codes).toContain('RECONCILIATION_DIVERGENT');
    expect(codes).toContain('RECONCILIATION_MISSING_SOURCE');
    expect(data.attention.total).toBe(codes.length);
    // Deterministic: blocking data-quality first.
    expect(codes[0]).toBe('MISSING_PRICE');

    const missing = data.attention.preview.find(
      (item: { code: string }) => item.code === 'MISSING_PRICE',
    );
    expect(missing).toMatchObject({
      domain: 'DATA_QUALITY',
      severity: 'BLOCKING',
      count: 1,
    });
    expect(missing.actions).toEqual([{ type: 'VIEW_DATA_QUALITY' }]);

    const failed = data.attention.preview.find(
      (item: { code: string }) => item.code === 'SYNC_FAILED',
    );
    expect(failed.facts.source).toBe('B3');
    expect(failed.actions).toEqual([{ type: 'VIEW_RUN_HISTORY' }]);

    // Run history is bounded and factual, without technical IDs.
    expect(data.recentActivity).toHaveLength(2);
    for (const row of data.recentActivity) {
      expect(Object.keys(row).sort()).toEqual(
        ['at', 'confirmed', 'newRecords', 'source', 'status', 'trigger'].sort(),
      );
    }
    expect(data.recentActivity.map((row: { status: string }) => row.status).sort()).toEqual([
      'AWAITING_REVIEW',
      'FAILED',
    ]);

    // Reconciliation matches the 5R-E summary exactly (same composer).
    const quality = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/data-quality`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(quality.status).toBe(200);
    expect(data.reconciliation).toEqual(quality.body.data.reconciliation);
    expect(data.dataQuality.status).toBe(quality.body.data.status);
    expect(data.dataQuality.summary).toEqual(quality.body.data.summary);
    expect(data.dataQuality.issuesByDomain).toEqual(quality.body.data.issuesByDomain);

    // Review count matches the inbox for the same portfolio (the inbox
    // list contains only actionable items by construction).
    const inbox = await request(app.getHttpServer())
      .get(`/api/v1/integration-reviews?portfolioId=${portfolioId}&limit=50`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(inbox.status).toBe(200);
    expect(data.reconciliation.pendingReviews).toBe(inbox.body.data.length);
    expect(data.reviewPreview.length).toBeLessThanOrEqual(5);
  });

  it('404s foreign portfolios, writes nothing and stays deterministic', async () => {
    const foreign = await request(app.getHttpServer())
      .get(opsUrl(randomUUID()))
      .set('Authorization', `Bearer ${authToken}`);
    expect(foreign.status).toBe(404);

    const asset = await createAsset();
    await buy(asset.id, `tx-5s-buy-z-${randomUUID()}`, addDays(todaySp(), -10));
    const before = await prisma.transaction.count({ where: { portfolioId } });
    const beforeRuns = await prisma.integrationRun.count({ where: { portfolioId } });
    const first = await request(app.getHttpServer())
      .get(opsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    const second = await request(app.getHttpServer())
      .get(opsUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(first.status).toBe(200);
    expect(second.body.data).toEqual({
      ...first.body.data,
      generatedAt: second.body.data.generatedAt,
    });
    expect(await prisma.transaction.count({ where: { portfolioId } })).toBe(before);
    expect(await prisma.integrationRun.count({ where: { portfolioId } })).toBe(beforeRuns);

    // No secrets, credentials, provider internals or raw payloads leak.
    const serialized = JSON.stringify(first.body.data);
    expect(serialized).not.toMatch(
      /secret|certificate|password|clientSecret|externalId|fingerprint|token/i,
    );
  });
});
