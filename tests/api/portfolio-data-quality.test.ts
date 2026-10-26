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
 * Phase 5R-E — portfolio data quality diagnostics (read-only).
 *
 * Consolidates valuation, cost-basis, FX, classification and
 * reconciliation facts into operational issues. No scores, no repairs,
 * no writes; bounded reads, never one replay per position.
 */
describe('API Integration: portfolio data quality (Phase 5R-E)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function qualityUrl(id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/data-quality`;
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
  async function createAsset(ticker?: string) {
    tickerSeq += 1;
    const name = ticker ?? `P5E${tickerSeq}`;
    const asset = Asset.create({
      ticker: name,
      name: `${name} S.A.`,
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

  async function postTx(body: Record<string, unknown>) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(body);
    expect(res.status).toBe(201);
    return res.body.data as { id: string };
  }

  async function buy(assetId: string, externalId: string, tradeDate: string) {
    return postTx({
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
  }

  async function seedQuote(assetId: string, tradingDate: string, close = '38.50') {
    await prisma.marketQuoteRecord.create({
      data: {
        assetId,
        tradingDate: new Date(`${tradingDate}T00:00:00.000Z`),
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

  it('reports a clean portfolio with structural limitations only', async () => {
    const asset = await createAsset();
    await buy(asset.id, `tx-5re-buy-1-${randomUUID()}`, addDays(todaySp(), -10));
    await seedQuote(asset.id, todaySp());

    const res = await request(app.getHttpServer())
      .get(qualityUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.portfolioId).toBe(portfolioId);
    expect(data.status).toBe('COMPLETE');
    expect(data.summary).toMatchObject({
      positionsTotal: 1,
      positionsWithoutIssues: 1,
      positionsReviewRequired: 0,
      positionsBlocked: 0,
      issuesTotal: 0,
      unvaluedCount: 0,
    });
    expect(data.issuesByDomain).toEqual([]);
    expect(data.positions).toHaveLength(1);
    expect(data.positions[0]).toMatchObject({
      assetId: asset.id,
      ticker: asset.ticker,
      status: 'COMPLETE',
      issueCount: 0,
      issues: [],
    });
    expect(data.portfolioIssues).toEqual([]);
    expect(data.reconciliation).toMatchObject({
      matched: 0,
      divergent: 0,
      missingLocal: 0,
      missingSource: 0,
      unresolved: 0,
      pendingReviews: 0,
      truncated: false,
    });
    // Structural gaps are reported once, never as position issues.
    expect(data.structuralLimitations).toEqual([
      'ISSUER_CLASSIFICATION_NOT_AVAILABLE',
      'SECTOR_CLASSIFICATION_NOT_AVAILABLE',
    ]);
    expect(data.limitations).toEqual([]);
  });

  it('flags missing price, stale price and incomplete cost basis per position', async () => {
    const missing = await createAsset();
    const stale = await createAsset();
    const incomplete = await createAsset();
    const day = addDays(todaySp(), -10);
    await buy(missing.id, `tx-5re-m-${randomUUID()}`, day);
    await buy(stale.id, `tx-5re-s-${randomUUID()}`, day);
    await buy(incomplete.id, `tx-5re-i-${randomUUID()}`, day);
    // Stale: quote exists but is old. Incomplete: unmatched transfer-in.
    await seedQuote(stale.id, addDays(todaySp(), -30));
    await seedQuote(incomplete.id, todaySp());
    await postTx({
      accountId,
      assetId: incomplete.id,
      type: 'TRANSFER_IN',
      quantity: '10',
      currency: 'BRL',
      tradeDate: day,
      provider: 'B3',
      externalId: `tx-5re-tin-${randomUUID()}`,
    });

    const res = await request(app.getHttpServer())
      .get(qualityUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.status).toBe('BLOCKED');
    expect(data.summary).toMatchObject({
      positionsTotal: 3,
      positionsBlocked: 2,
      positionsReviewRequired: 1,
      positionsWithoutIssues: 0,
    });

    const byId = new Map(data.positions.map((row: { assetId: string }) => [row.assetId, row]));
    const missingRow = byId.get(missing.id) as { status: string; issues: Array<{ code: string }> };
    expect(missingRow.status).toBe('BLOCKED');
    expect(missingRow.issues.map((issue) => issue.code)).toEqual(['MISSING_PRICE']);
    expect(missingRow.issues[0]).toMatchObject({
      domain: 'MARKET_DATA',
      severity: 'BLOCKING',
      actions: [{ type: 'VIEW_POSITION', assetId: missing.id }],
    });
    expect(missingRow.issues[0].affectedCapabilities).toContain('VALUATION');

    const staleRow = byId.get(stale.id) as {
      status: string;
      issues: Array<{ code: string; facts: { asOf: string | null } }>;
    };
    expect(staleRow.status).toBe('REVIEW_REQUIRED');
    expect(staleRow.issues.map((issue) => issue.code)).toEqual(['STALE_PRICE']);
    expect(staleRow.issues[0].facts.asOf).not.toBeNull();

    const incompleteRow = byId.get(incomplete.id) as {
      status: string;
      issues: Array<{ code: string }>;
    };
    expect(incompleteRow.status).toBe('BLOCKED');
    expect(incompleteRow.issues.map((issue) => issue.code)).toEqual(['INCOMPLETE_COST_BASIS']);

    // Dedupe: one issue per root cause; ordering is deterministic.
    const codes = data.positions.flatMap((row: { issues: Array<{ code: string }> }) =>
      row.issues.map((issue) => issue.code),
    );
    expect([...codes].sort()).toEqual(['INCOMPLETE_COST_BASIS', 'MISSING_PRICE', 'STALE_PRICE']);
  });

  it('integrates reconciliation problem states without per-asset inference', async () => {
    const asset = await createAsset();
    await buy(asset.id, `tx-5re-buy-r-${randomUUID()}`, addDays(todaySp(), -10));
    await seedQuote(asset.id, todaySp());
    await prisma.integrationRun.create({
      data: {
        portfolioId,
        source: 'B3',
        status: 'AWAITING_REVIEW',
        reconciliationMatched: 8,
        reconciliationDivergent: 2,
        reconciliationMissingLocal: 1,
        reconciliationMissingSource: 0,
        reconciliationUnresolved: 1,
      },
    });

    const res = await request(app.getHttpServer())
      .get(qualityUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.reconciliation).toMatchObject({
      matched: 8,
      divergent: 2,
      missingLocal: 1,
      missingSource: 0,
      unresolved: 1,
      truncated: false,
    });
    // MATCHED is an aggregate count, never individual issues.
    // Order is deterministic: severity, domain, code.
    const codes = data.portfolioIssues.map((issue: { code: string }) => issue.code);
    expect(codes).toEqual([
      'PENDING_INTEGRATION_REVIEW',
      'RECONCILIATION_DIVERGENT',
      'RECONCILIATION_MISSING_LOCAL',
      'RECONCILIATION_UNRESOLVED',
    ]);
    for (const issue of data.portfolioIssues) {
      expect(issue.domain).toBe('RECONCILIATION');
      expect(issue.severity).toBe('REVIEW');
      expect(issue.facts.assetId).toBeNull();
      expect(issue.actions).toEqual([{ type: 'VIEW_REVIEWS', assetId: null }]);
    }
    expect(data.issuesByDomain).toEqual([{ domain: 'RECONCILIATION', count: 4 }]);
    // The clean position stays clean: no fake per-asset association.
    expect(data.positions[0].issues).toEqual([]);
  });

  it('handles empty portfolios, foreign portfolios, zero writes and determinism', async () => {
    const empty = await request(app.getHttpServer())
      .get(qualityUrl())
      .set('Authorization', `Bearer ${authToken}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data.status).toBe('COMPLETE');
    expect(empty.body.data.summary.positionsTotal).toBe(0);
    expect(empty.body.data.issuesByDomain).toEqual([]);
    expect(empty.body.data.limitations).toEqual(['NO_ACTIVITY']);
    expect(empty.body.data.structuralLimitations).toHaveLength(2);

    const foreign = await request(app.getHttpServer())
      .get(qualityUrl(randomUUID()))
      .set('Authorization', `Bearer ${authToken}`);
    expect(foreign.status).toBe(404);

    const asset = await createAsset();
    await buy(asset.id, `tx-5re-buy-z-${randomUUID()}`, addDays(todaySp(), -10));
    const before = await prisma.transaction.count({ where: { portfolioId } });
    const first = await request(app.getHttpServer())
      .get(qualityUrl())
      .set('Authorization', `Bearer ${authToken}`);
    const second = await request(app.getHttpServer())
      .get(qualityUrl())
      .set('Authorization', `Bearer ${authToken}`);
    const after = await prisma.transaction.count({ where: { portfolioId } });
    expect(first.status).toBe(200);
    expect(second.body.data).toEqual({
      ...first.body.data,
      generatedAt: second.body.data.generatedAt,
    });
    expect(after).toBe(before);
    expect(JSON.stringify(first.body.data)).not.toMatch(/externalId|provider/i);
  });
});
