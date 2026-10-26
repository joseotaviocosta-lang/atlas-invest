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
 * Phase 5R-D — position income intelligence (read-only).
 *
 * Canonical income for one open position over its current holding
 * lifecycle: totals by type, monthly timeline, recent events and the
 * share of known portfolio income. Facts only — no yield, no forecast,
 * no advice.
 */
describe('API Integration: position income intelligence (Phase 5R-D)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  const prisma = getTestPrismaClient();

  function positionIncomeUrl(assetId: string, query = '', id: string = portfolioId): string {
    return `/api/v1/portfolios/${id}/positions/${assetId}/income${query}`;
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

  let tickerSeq = 100;
  async function createAsset(currency = 'BRL') {
    tickerSeq += 1;
    const ticker = `P5I${tickerSeq}`;
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

  it('returns totals by type, timeline, share and recent events', async () => {
    const anchor = addDays(todaySp(), -200);
    const a = await createAsset();
    const b = await createAsset();
    await buy(a.id, `tx-5ri-buy-a-${randomUUID()}`, addDays(anchor, -10));
    await buy(b.id, `tx-5ri-buy-b-${randomUUID()}`, addDays(anchor, -10));
    await income(a.id, 'DIVIDEND', '100.00', `tx-5ri-div-a1-${randomUUID()}`, addDays(anchor, 5));
    await income(a.id, 'JCP', '25.00', `tx-5ri-jcp-a-${randomUUID()}`, addDays(anchor, 35));
    await income(b.id, 'DIVIDEND', '300.00', `tx-5ri-div-b-${randomUUID()}`, addDays(anchor, 40));

    const res = await request(app.getHttpServer())
      .get(positionIncomeUrl(a.id, `?startDate=${anchor}&endDate=${todaySp()}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.portfolioId).toBe(portfolioId);
    expect(data.assetId).toBe(a.id);
    expect(data.totalsByCurrency).toEqual([
      { currency: 'BRL', dividends: '100', jcp: '25', fiiIncome: '0', total: '125', eventCount: 2 },
    ]);
    expect(data.eventCount).toBe(2);
    expect(data.recentEvents).toHaveLength(2);
    // Newest first.
    expect(data.recentEvents[0].tradeDate >= data.recentEvents[1].tradeDate).toBe(true);

    // Share uses the same currency and period: 125 / (100 + 25 + 300).
    expect(data.portfolioShare).toEqual([{ currency: 'BRL', shareBp: '2941' }]);

    // Timeline enumerates every month of the range with zero-filled months.
    const expectedMonths = Math.round(
      (Date.UTC(
        Number(todaySp().slice(0, 4)),
        Number(todaySp().slice(5, 7)) - 1,
        Number(todaySp().slice(8, 10)),
      ) -
        Date.UTC(
          Number(anchor.slice(0, 4)),
          Number(anchor.slice(5, 7)) - 1,
          Number(anchor.slice(8, 10)),
        )) /
        86_400_000,
    );
    expect(data.period.months.length).toBeGreaterThanOrEqual(6);
    expect(expectedMonths / 31).toBeLessThanOrEqual(data.period.months.length + 1);
    expect(data.timeline.map((bucket: { month: string }) => bucket.month)).toEqual(
      data.period.months,
    );
    expect(data.limitations).toEqual([]);
  });

  it('reconciles with the 5R-B income component for the same period', async () => {
    const anchor = addDays(todaySp(), -200);
    const a = await createAsset();
    await buy(a.id, `tx-5ri-buy-c-${randomUUID()}`, addDays(anchor, -10));
    const divDate = addDays(anchor, 24);
    await income(a.id, 'DIVIDEND', '100.00', `tx-5ri-div-c-${randomUUID()}`, divDate);

    const incomeRes = await request(app.getHttpServer())
      .get(positionIncomeUrl(a.id, `?startDate=${anchor}&endDate=${todaySp()}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(incomeRes.status).toBe(200);

    const perfRes = await request(app.getHttpServer())
      .get(
        `/api/v1/portfolios/${portfolioId}/positions/${a.id}/performance?startDate=${anchor}&endDate=${todaySp()}`,
      )
      .set('Authorization', `Bearer ${authToken}`);
    expect(perfRes.status).toBe(200);

    const incomeTotal = incomeRes.body.data.totalsByCurrency.find(
      (row: { currency: string }) => row.currency === 'BRL',
    )?.total;
    const perfIncome = perfRes.body.data.income.totalsByCurrency.find(
      (row: { currency: string }) => row.currency === 'BRL',
    )?.total;
    expect(incomeTotal).toBe(perfIncome);

    // The monthly income buckets sum back to the position total.
    const bucketSum = incomeRes.body.data.timeline
      .flatMap((bucket: { totals: Array<{ currency: string; total: string }> }) => bucket.totals)
      .filter((row: { currency: string }) => row.currency === 'BRL')
      .reduce((sum: number, row: { total: string }) => sum + Number(row.total), 0);
    expect(bucketSum).toBeCloseTo(Number(incomeTotal), 9);
  });

  it('restarts the lifecycle after a close and reopen', async () => {
    const anchor = addDays(todaySp(), -200);
    const a = await createAsset();
    await buy(a.id, `tx-5ri-buy-r-${randomUUID()}`, addDays(anchor, -10));
    await income(a.id, 'DIVIDEND', '60.00', `tx-5ri-div-old-${randomUUID()}`, addDays(anchor, 5));
    // Full close, then reopen: the old dividend belongs to the prior lifecycle.
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
      externalId: `tx-5ri-sell-r-${randomUUID()}`,
    });
    const reopenDate = addDays(anchor, 80);
    await buy(a.id, `tx-5ri-buy-r2-${randomUUID()}`, reopenDate);
    await income(a.id, 'DIVIDEND', '40.00', `tx-5ri-div-new-${randomUUID()}`, addDays(anchor, 90));

    const res = await request(app.getHttpServer())
      .get(positionIncomeUrl(a.id, `?startDate=${anchor}&endDate=${todaySp()}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.inceptionDate).toBe(reopenDate);
    expect(res.body.data.totalsByCurrency).toEqual([
      { currency: 'BRL', dividends: '40', jcp: '0', fiiIncome: '0', total: '40', eventCount: 1 },
    ]);
  });

  it('404s closed and unknown positions and 400s invalid periods', async () => {
    const anchor = addDays(todaySp(), -200);
    const a = await createAsset();
    await buy(a.id, `tx-5ri-buy-x-${randomUUID()}`, addDays(anchor, -10));
    await income(a.id, 'DIVIDEND', '10.00', `tx-5ri-div-x-${randomUUID()}`, addDays(anchor, 5));
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
      externalId: `tx-5ri-sell-x-${randomUUID()}`,
    });
    const closed = await request(app.getHttpServer())
      .get(positionIncomeUrl(a.id, `?startDate=${anchor}&endDate=${todaySp()}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(closed.status).toBe(404);

    const unknown = await request(app.getHttpServer())
      .get(positionIncomeUrl(randomUUID()))
      .set('Authorization', `Bearer ${authToken}`);
    expect(unknown.status).toBe(404);

    const b = await createAsset();
    await buy(b.id, `tx-5ri-buy-y-${randomUUID()}`, addDays(anchor, -10));
    const badRange = await request(app.getHttpServer())
      .get(positionIncomeUrl(b.id, `?startDate=${todaySp()}&endDate=${anchor}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(badRange.status).toBe(400);

    const foreign = await request(app.getHttpServer())
      .get(positionIncomeUrl(b.id, '', randomUUID()))
      .set('Authorization', `Bearer ${authToken}`);
    expect(foreign.status).toBe(404);

    // Read-only: GET changes nothing and double GET is deterministic.
    const before = await prisma.transaction.count({ where: { portfolioId } });
    const first = await request(app.getHttpServer())
      .get(positionIncomeUrl(b.id, `?startDate=${anchor}&endDate=${todaySp()}`))
      .set('Authorization', `Bearer ${authToken}`);
    const second = await request(app.getHttpServer())
      .get(positionIncomeUrl(b.id, `?startDate=${anchor}&endDate=${todaySp()}`))
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
