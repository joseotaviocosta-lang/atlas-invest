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
 * Phase 5R-D — portfolio income intelligence (read-only).
 *
 * Historical income actually recorded in the canonical ledger: per-currency
 * totals split by DIVIDEND/JCP/FII_INCOME, monthly buckets, factual
 * by-position ranking with portfolio share and neutral concentration facts.
 * Closed positions stay included (their income happened). No yield,
 * no forecast, no persistence.
 */
describe('API Integration: portfolio income intelligence (Phase 5R-D)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function incomeUrl(query = '', id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/income-intelligence${query}`;
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
  async function createAsset(currency = 'BRL') {
    tickerSeq += 1;
    const ticker = `P5D${tickerSeq}`;
    const asset = Asset.create({
      ticker,
      name: `${ticker} S.A.`,
      type: 'STOCK' as never,
      currency,
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

  async function income(
    assetId: string,
    type: string,
    amount: string,
    externalId: string,
    tradeDate: string,
  ) {
    return postTx({
      accountId,
      assetId,
      type,
      amount,
      currency: 'BRL',
      tradeDate,
      provider: 'B3',
      externalId,
    });
  }

  it('aggregates income by type without mixing and ranks positions', async () => {
    const anchor = addDays(todaySp(), -200);
    const a = await createAsset();
    const b = await createAsset();
    await buy(a.id, `tx-5rd-buy-a-${randomUUID()}`, addDays(anchor, -10));
    await buy(b.id, `tx-5rd-buy-b-${randomUUID()}`, addDays(anchor, -10));
    await income(a.id, 'DIVIDEND', '100.00', `tx-5rd-div-a-${randomUUID()}`, addDays(anchor, 5));
    await income(a.id, 'JCP', '25.00', `tx-5rd-jcp-a-${randomUUID()}`, addDays(anchor, 35));
    await income(b.id, 'FII_INCOME', '50.00', `tx-5rd-fii-b-${randomUUID()}`, addDays(anchor, 40));

    const res = await request(app.getHttpServer())
      .get(incomeUrl(`?startDate=${anchor}&endDate=${todaySp()}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.portfolioId).toBe(portfolioId);
    expect(data.totalsByCurrency).toEqual([
      {
        currency: 'BRL',
        dividends: '100',
        jcp: '25',
        fiiIncome: '50',
        total: '175',
        eventCount: 3,
      },
    ]);

    // By-type reconciliation: type splits sum to the currency total.
    for (const row of data.totalsByCurrency) {
      expect(Number(row.dividends) + Number(row.jcp) + Number(row.fiiIncome)).toBeCloseTo(
        Number(row.total),
        9,
      );
    }

    // By-position reconciliation: rows sum to the portfolio total and
    // carry deterministic ranks and exact shares.
    expect(data.byPosition).toHaveLength(2);
    expect(data.byPosition[0]).toMatchObject({ assetId: a.id, rank: 1, shareBp: '7143' });
    expect(data.byPosition[1]).toMatchObject({ assetId: b.id, rank: 2, shareBp: '2857' });
    const positionSum = data.byPosition
      .filter((row: { currency: string }) => row.currency === 'BRL')
      .reduce((sum: number, row: { total: string }) => sum + Number(row.total), 0);
    expect(positionSum).toBeCloseTo(Number(data.totalsByCurrency[0].total), 9);

    // Concentration facts are neutral largest/top-3 shares.
    expect(data.concentration).toHaveLength(1);
    expect(data.concentration[0]).toMatchObject({
      currency: 'BRL',
      top3ShareBp: '10000',
    });
    expect(data.concentration[0].largest).toMatchObject({ assetId: a.id, shareBp: '7143' });
    expect(data.limitations).toEqual([]);
  });

  it('keeps currencies separate and fails closed on empty periods', async () => {
    const anchor = addDays(todaySp(), -200);
    const a = await createAsset('BRL');
    const u = await createAsset('USD');
    await buy(a.id, `tx-5rd-buy-mc-a-${randomUUID()}`, addDays(anchor, -10));
    await income(a.id, 'DIVIDEND', '100.00', `tx-5rd-mc-a-${randomUUID()}`, addDays(anchor, 5));
    await postTx({
      accountId,
      assetId: u.id,
      type: 'DIVIDEND',
      amount: '10.00',
      currency: 'USD',
      tradeDate: addDays(anchor, 6),
      provider: 'B3',
      externalId: `tx-5rd-mc-u-${randomUUID()}`,
    });

    const res = await request(app.getHttpServer())
      .get(incomeUrl(`?startDate=${anchor}&endDate=${todaySp()}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalsByCurrency).toEqual([
      { currency: 'BRL', dividends: '100', jcp: '0', fiiIncome: '0', total: '100', eventCount: 1 },
      { currency: 'USD', dividends: '10', jcp: '0', fiiIncome: '0', total: '10', eventCount: 1 },
    ]);
    // One bucket per currency per month — never a mixed total.
    for (const bucket of res.body.data.timeline) {
      expect(bucket.totals.map((row: { currency: string }) => row.currency)).toEqual([
        'BRL',
        'USD',
      ]);
    }

    // Empty period: explicit limitation, empty totals, zero-write safe.
    const empty = await request(app.getHttpServer())
      .get(incomeUrl(`?startDate=${addDays(todaySp(), -30)}&endDate=${addDays(todaySp(), -20)}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data.totalsByCurrency).toEqual([]);
    expect(empty.body.data.limitations).toContain('NO_INCOME_IN_PERIOD');
  });

  it('includes closed-position income in the portfolio aggregate', async () => {
    const anchor = addDays(todaySp(), -200);
    const a = await createAsset();
    await buy(a.id, `tx-5rd-buy-c-${randomUUID()}`, addDays(anchor, -10));
    await income(a.id, 'DIVIDEND', '60.00', `tx-5rd-div-c-${randomUUID()}`, addDays(anchor, 5));
    // Full close after the dividend: the income happened and must stay.
    await postTx({
      accountId,
      assetId: a.id,
      type: 'SELL',
      quantity: '100',
      unitPrice: '30.00',
      totalAmount: '3000.00',
      currency: 'BRL',
      tradeDate: addDays(anchor, 50),
      provider: 'B3',
      externalId: `tx-5rd-sell-c-${randomUUID()}`,
    });

    const res = await request(app.getHttpServer())
      .get(incomeUrl(`?startDate=${anchor}&endDate=${todaySp()}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalsByCurrency).toEqual([
      { currency: 'BRL', dividends: '60', jcp: '0', fiiIncome: '0', total: '60', eventCount: 1 },
    ]);
    expect(res.body.data.byPosition).toHaveLength(1);
    expect(res.body.data.byPosition[0]).toMatchObject({
      assetId: a.id,
      isOpen: false,
      hasDetail: false,
    });
  });

  it('rejects invalid periods and foreign portfolios, and is deterministic', async () => {
    const anchor = addDays(todaySp(), -200);
    const badRange = await request(app.getHttpServer())
      .get(incomeUrl(`?startDate=${todaySp()}&endDate=${anchor}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(badRange.status).toBe(400);

    const future = await request(app.getHttpServer())
      .get(incomeUrl(`?endDate=${addDays(todaySp(), 5)}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(future.status).toBe(400);

    const foreign = await request(app.getHttpServer())
      .get(incomeUrl('', randomUUID()))
      .set('Authorization', `Bearer ${authToken}`);
    expect(foreign.status).toBe(404);

    // Deterministic double GET with no writes in between.
    const a = await createAsset();
    await buy(a.id, `tx-5rd-buy-d-${randomUUID()}`, addDays(anchor, -10));
    await income(a.id, 'DIVIDEND', '42.50', `tx-5rd-div-d-${randomUUID()}`, addDays(anchor, 5));
    const before = await prisma.transaction.count({ where: { portfolioId } });
    const first = await request(app.getHttpServer())
      .get(incomeUrl(`?startDate=${anchor}&endDate=${todaySp()}`))
      .set('Authorization', `Bearer ${authToken}`);
    const second = await request(app.getHttpServer())
      .get(incomeUrl(`?startDate=${anchor}&endDate=${todaySp()}`))
      .set('Authorization', `Bearer ${authToken}`);
    const after = await prisma.transaction.count({ where: { portfolioId } });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual({
      ...first.body.data,
      generatedAt: second.body.data.generatedAt,
    });
    expect(after).toBe(before);

    // No internal provider/external identifiers leak into the payload.
    const serialized = JSON.stringify(first.body.data);
    expect(serialized).not.toMatch(/externalId|provider/i);
  });
});
