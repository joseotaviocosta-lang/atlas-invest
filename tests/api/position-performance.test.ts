import 'reflect-metadata';

// Force deterministic in-memory providers before the Nest app factories run.
process.env.MARKET_DATA_PROVIDER = 'IN_MEMORY';
process.env.HISTORICAL_MARKET_DATA_PROVIDER = 'IN_MEMORY';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Asset } from '@atlas/domain';
import type { InMemoryHistoricalMarketDataProvider } from '@atlas/market-data';
import { HISTORICAL_MARKET_DATA_PROVIDER } from '../../apps/api/src/market-data/tokens';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
  createAuthenticatedUserSession,
  seedBaseFixtures,
} from './setup';

/**
 * Phase 5R-B — position performance and contribution (read-only).
 *
 * TWR via the shared engine, realized/unrealized/income components,
 * economic P&L and monthly attribution. No new engine, no persistence,
 * no recommendations. Transfer/corporate-action semantics follow the
 * canonical replay: no artificial returns, no zeroed unknowns.
 *
 * All dates derive from the wall-clock today so the suite stays
 * deterministic no matter when it runs.
 */
describe('API Integration: position performance (Phase 5R-B)', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let userId: string;
  let historical: InMemoryHistoricalMarketDataProvider;
  const prisma = getTestPrismaClient();

  function perfUrl(assetId: string, id: string = portfolioId, query = ''): string {
    return `/api/v1/portfolios/${id}/positions/${assetId}/performance${query}`;
  }

  beforeAll(async () => {
    app = await createTestApp();
    historical = app.get<InMemoryHistoricalMarketDataProvider>(HISTORICAL_MARKET_DATA_PROVIDER);
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

  function firstOfMonth(dateStr: string): string {
    return `${dateStr.slice(0, 7)}-01`;
  }

  /** First day of the month, two months before the current one: stable anchor. */
  function anchorStart(): string {
    return firstOfMonth(addDays(todaySp(), -75));
  }

  function monthStartsBetween(from: string, to: string): string[] {
    const out: string[] = [];
    let cursor = firstOfMonth(from);
    if (cursor < from) cursor = firstOfMonth(addDays(cursor, 32));
    while (cursor <= to) {
      out.push(cursor);
      cursor = firstOfMonth(addDays(cursor, 32));
    }
    return out;
  }

  let tickerSeq = 0;
  async function createAsset(currency = 'BRL') {
    tickerSeq += 1;
    const ticker = `P5R${tickerSeq}`;
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

  function seedQuote(ticker: string, close: string, date: string, currency = 'BRL') {
    historical.seed({ ticker, exchange: 'B3', date, close, currency });
  }

  async function postTx(body: Record<string, unknown>, forPortfolioId: string = portfolioId) {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${forPortfolioId}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(body);
    expect(res.status).toBe(201);
    return res.body.data as { id: string };
  }

  async function buy(
    assetId: string,
    quantity: string,
    unitPrice: string,
    externalId: string,
    tradeDate: string,
    forAccountId?: string,
  ) {
    return postTx({
      accountId: forAccountId ?? accountId,
      assetId,
      type: 'BUY',
      quantity,
      unitPrice,
      totalAmount: (Number(quantity) * Number(unitPrice)).toFixed(2),
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

  function closeTo(actual: string | null, expected: string, epsilon = 1e-9): boolean {
    if (actual === null) return false;
    return Math.abs(Number(actual) - Number(expected)) < epsilon;
  }

  it('computes buy-and-hold TWR with the shared engine', async () => {
    const start = anchorStart();
    const months = monthStartsBetween(start, todaySp());
    const asset = await createAsset();
    await buy(asset.id, '100', '30.00', 'tx-5rb-buy-1', addDays(start, -12));
    // Rising prices: 35 at start, 38 mid, 38.50 today. No in-period flows.
    seedQuote(asset.ticker, '35.00', start);
    for (const month of months.slice(1)) seedQuote(asset.ticker, '38.00', month);
    seedQuote(asset.ticker, '38.50', todaySp());

    const res = await request(app.getHttpServer())
      .get(perfUrl(asset.id, portfolioId, `?startDate=${start}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.inceptionDate).toBe(addDays(start, -12));
    expect(data.return.status).toBe('COMPLETE');
    expect(data.return.dataAvailability).toBe('AVAILABLE');
    // (3850 / 3500 - 1) * 100 = 10 exactly: no flows inside the window.
    expect(closeTo(data.return.twr, '10')).toBe(true);
    expect(data.return.actualStartDate).toBe(start);
    expect(data.marketDataAsOf).not.toBeNull();
    // Single position: contribution equals the chained return.
    expect(data.contribution).not.toBeNull();
    expect(closeTo(data.contribution.totalPp, data.return.twr)).toBe(true);
    expect(closeTo(data.contribution.portfolioReturnOnGrid, data.return.twr)).toBe(true);
    expect(data.limitations).toEqual([]);
  });

  it('aggregates multiple buys, a partial sale and income without inventing formulas', async () => {
    const start = anchorStart();
    const months = monthStartsBetween(start, todaySp());
    const asset = await createAsset();
    const buyDate = addDays(start, -12);
    const subDate = addDays(start, 4);
    const sellDate = addDays(start, 19);
    const divDate = addDays(start, 24);
    await buy(asset.id, '100', '30.00', 'tx-5rb-buy-a', buyDate);
    await postTx({
      accountId,
      assetId: asset.id,
      type: 'SUBSCRIPTION',
      quantity: '50',
      unitPrice: '36.00',
      totalAmount: '1800.00',
      currency: 'BRL',
      tradeDate: subDate,
      provider: 'B3',
      externalId: 'tx-5rb-sub-1',
    });
    await postTx({
      accountId,
      assetId: asset.id,
      type: 'SELL',
      quantity: '40',
      unitPrice: '40.00',
      totalAmount: '1600.00',
      currency: 'BRL',
      tradeDate: sellDate,
      provider: 'B3',
      externalId: 'tx-5rb-sell-1',
    });
    await income(asset.id, 'DIVIDEND', '100.00', 'tx-5rb-div-1', divDate);
    seedQuote(asset.ticker, '34.00', start);
    seedQuote(asset.ticker, '36.00', subDate);
    seedQuote(asset.ticker, '40.00', sellDate);
    seedQuote(asset.ticker, '40.00', divDate);
    for (const month of months.slice(1)) seedQuote(asset.ticker, '38.00', month);
    seedQuote(asset.ticker, '38.50', todaySp());

    const res = await request(app.getHttpServer())
      .get(perfUrl(asset.id, portfolioId, `?startDate=${start}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;

    // Realized: avg cost (3000 + 1800) / 150 = 32; 40 x (40 - 32) = 320.
    expect(data.realized.byCurrency).toEqual([
      { currency: 'BRL', gainLoss: '320', status: 'KNOWN', disposalCount: 1 },
    ]);
    // Income is a component, never a TWR flow.
    expect(data.income.totalsByCurrency).toEqual([
      { currency: 'BRL', dividends: '100', jcp: '0', fiiIncome: '0', total: '100' },
    ]);
    // Unrealized: 110 x 38.50 - (4800 - 1280) = 4235 - 3520 = 715.
    expect(data.unrealized).toMatchObject({ amount: '715', currency: 'BRL' });
    // Economic P&L: 320 + 715 + 100 = 1135.
    const brl = data.economicPnl.totalsByCurrency.find(
      (row: { currency: string }) => row.currency === 'BRL',
    );
    expect(brl).toMatchObject({ realized: '320', unrealized: '715', income: '100', total: '1135' });
    // Return is computed (price + flows), income excluded from TWR.
    expect(data.return.status).toBe('COMPLETE');
    expect(data.return.twr).not.toBeNull();
    expect(data.limitations).toEqual([]);
  });

  it('keeps matched transfers return-neutral and flags unmatched ones', async () => {
    const start = anchorStart();
    const months = monthStartsBetween(start, todaySp());
    const asset = await createAsset();
    await buy(asset.id, '100', '30.00', 'tx-5rb-buy-t', addDays(start, -12));
    const accRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        institutionId: '22222222-2222-4222-8222-222222222222',
        name: 'Conta 2',
        currency: 'BRL',
      });
    const secondAccountId = accRes.body.data.id as string;
    const group = randomUUID();
    const transferDate = addDays(start, 9);
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId,
        assetId: asset.id,
        type: 'TRANSFER_OUT',
        tradeDate: new Date(`${transferDate}T00:00:00.000Z`),
        quantity: '40',
        currency: 'BRL',
        transferGroupId: group,
      },
    });
    await prisma.transaction.create({
      data: {
        portfolioId,
        accountId: secondAccountId,
        assetId: asset.id,
        type: 'TRANSFER_IN',
        tradeDate: new Date(`${transferDate}T00:00:00.000Z`),
        quantity: '40',
        currency: 'BRL',
        transferGroupId: group,
      },
    });
    seedQuote(asset.ticker, '35.00', start);
    seedQuote(asset.ticker, '36.00', transferDate);
    for (const month of months.slice(1)) seedQuote(asset.ticker, '38.00', month);
    seedQuote(asset.ticker, '38.50', todaySp());

    const res = await request(app.getHttpServer())
      .get(perfUrl(asset.id, portfolioId, `?startDate=${start}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    // Net-zero capital movement mid-period: same as buy-and-hold, exactly 10%.
    expect(data.return.status).toBe('COMPLETE');
    expect(closeTo(data.return.twr, '10')).toBe(true);
    expect(data.limitations).not.toContain('INCOMPLETE_COST_BASIS');

    // Unmatched transfer-in: unknown basis, no invented flow or return.
    const vale = await createAsset();
    await postTx({
      accountId,
      assetId: vale.id,
      type: 'TRANSFER_IN',
      quantity: '50',
      currency: 'BRL',
      tradeDate: addDays(start, 11),
      provider: 'BROKER',
      externalId: 'tx-5rb-unmatched-in',
    });
    seedQuote(vale.ticker, '61.00', todaySp());
    const unmatched = await request(app.getHttpServer())
      .get(perfUrl(vale.id, portfolioId, `?startDate=${start}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(unmatched.status).toBe(200);
    expect(unmatched.body.data.return.twr).toBeNull();
    expect(unmatched.body.data.limitations).toContain('INCOMPLETE_COST_BASIS');
    expect(unmatched.body.data.unrealized).toBeNull();
  });

  it('treats splits as quantity-only with no artificial return', async () => {
    const start = anchorStart();
    const months = monthStartsBetween(start, todaySp());
    const asset = await createAsset();
    const buyDate = addDays(start, 4);
    const splitDate = addDays(start, 34);
    await buy(asset.id, '100', '30.00', 'tx-5rb-buy-split', buyDate);
    await postTx({
      accountId,
      assetId: asset.id,
      type: 'SPLIT',
      quantity: '100',
      factor: '2',
      currency: 'BRL',
      tradeDate: splitDate,
      provider: 'B3',
      externalId: 'tx-5rb-split-1',
    });
    seedQuote(asset.ticker, '30.00', buyDate);
    for (const month of months.slice(1)) seedQuote(asset.ticker, '30.00', month);
    seedQuote(asset.ticker, '15.00', splitDate);
    seedQuote(asset.ticker, '15.00', todaySp());

    const res = await request(app.getHttpServer())
      .get(perfUrl(asset.id, portfolioId, `?startDate=${buyDate}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.return.status).toBe('COMPLETE');
    expect(closeTo(res.body.data.return.twr, '0')).toBe(true);
  });

  it('starts a fresh holding after close and reports no position before it', async () => {
    const start = anchorStart();
    const months = monthStartsBetween(start, addDays(todaySp(), -1));
    const asset = await createAsset();
    const buyDate = addDays(start, -60);
    const sellDate = addDays(start, -30);
    const rebuyDate = addDays(start, -10);
    await buy(asset.id, '100', '30.00', 'tx-5rb-buy-r1', buyDate);
    await postTx({
      accountId,
      assetId: asset.id,
      type: 'SELL',
      quantity: '100',
      unitPrice: '35.00',
      totalAmount: '3500.00',
      currency: 'BRL',
      tradeDate: sellDate,
      provider: 'B3',
      externalId: 'tx-5rb-sell-all',
    });
    await buy(asset.id, '50', '40.00', 'tx-5rb-buy-r2', rebuyDate);
    for (const month of months) seedQuote(asset.ticker, '40.00', month);
    seedQuote(asset.ticker, '40.00', buyDate);
    seedQuote(asset.ticker, '40.00', sellDate);
    seedQuote(asset.ticker, '40.00', rebuyDate);
    seedQuote(asset.ticker, '40.00', todaySp());

    const res = await request(app.getHttpServer())
      .get(perfUrl(asset.id, portfolioId, `?startDate=${addDays(start, -90)}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.inceptionDate).toBe(rebuyDate);

    const before = await request(app.getHttpServer())
      .get(
        perfUrl(
          asset.id,
          portfolioId,
          `?startDate=${addDays(start, -90)}&endDate=${addDays(rebuyDate, -1)}`,
        ),
      )
      .set('Authorization', `Bearer ${authToken}`);
    expect(before.status).toBe(200);
    expect(before.body.data.return.twr).toBeNull();
    expect(before.body.data.return.status).toBe('NOT_AVAILABLE');
    expect(before.body.data.limitations).toContain('NO_POSITION_IN_PERIOD');
  });

  it('keeps return computable without cost basis but nulls cost metrics', async () => {
    const start = anchorStart();
    const months = monthStartsBetween(start, todaySp());
    const asset = await createAsset();
    const buyDate = addDays(start, 4);
    const bonusDate = addDays(start, 34);
    await buy(asset.id, '100', '30.00', 'tx-5rb-buy-bonus', buyDate);
    await postTx({
      accountId,
      assetId: asset.id,
      type: 'BONUS',
      quantity: '10',
      currency: 'BRL',
      tradeDate: bonusDate,
      provider: 'B3',
      externalId: 'tx-5rb-bonus-1',
    });
    seedQuote(asset.ticker, '30.00', buyDate);
    for (const month of months.slice(1)) seedQuote(asset.ticker, '33.00', month);
    seedQuote(asset.ticker, '33.00', bonusDate);
    seedQuote(asset.ticker, '33.00', todaySp());

    const res = await request(app.getHttpServer())
      .get(perfUrl(asset.id, portfolioId, `?startDate=${buyDate}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    // Value-continuous bonus (no flow): 3000 -> 3630 -> 3630 = +21%.
    expect(data.return.status).toBe('COMPLETE');
    expect(closeTo(data.return.twr, '21')).toBe(true);
    expect(data.unrealized).toBeNull();
    expect(data.limitations).toContain('INCOMPLETE_COST_BASIS');
  });

  it('fails closed on missing start, end and flow prices', async () => {
    const start = anchorStart();
    const asset = await createAsset();
    await buy(asset.id, '100', '30.00', 'tx-5rb-buy-miss', addDays(start, -12));
    seedQuote(asset.ticker, '38.00', firstOfMonth(todaySp()));
    seedQuote(asset.ticker, '38.50', todaySp());

    const missingStart = await request(app.getHttpServer())
      .get(perfUrl(asset.id, portfolioId, `?startDate=${addDays(start, -200)}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(missingStart.status).toBe(200);
    expect(missingStart.body.data.return.status).toBe('PARTIAL');
    expect(missingStart.body.data.limitations).toContain('MISSING_START_PRICE');
    expect(missingStart.body.data.return.actualStartDate).toBe(firstOfMonth(todaySp()));

    seedQuote(asset.ticker, '35.00', start);
    seedQuote(asset.ticker, '36.00', addDays(start, 7));
    // End far beyond the 7-day lookback: unvalued end with a valued start.
    const missingEndDate = addDays(firstOfMonth(addDays(start, 40)), 9);
    seedQuote(asset.ticker, '36.50', firstOfMonth(addDays(start, 40)));
    const missingEnd = await request(app.getHttpServer())
      .get(perfUrl(asset.id, portfolioId, `?startDate=${start}&endDate=${missingEndDate}`))
      .set('Authorization', `Bearer ${authToken}`);
    expect(missingEnd.status).toBe(200);
    expect(missingEnd.body.data.return.status).toBe('PARTIAL');
    expect(missingEnd.body.data.limitations).toContain('MISSING_END_PRICE');
  });

  it('flags a stale end price instead of calling it current', async () => {
    const asset = await createAsset();
    await buy(asset.id, '100', '30.00', 'tx-5rb-buy-stale', todaySp(-30));
    seedQuote(asset.ticker, '35.00', todaySp(-30));
    seedQuote(asset.ticker, '38.00', todaySp(-1));

    const res = await request(app.getHttpServer())
      .get(perfUrl(asset.id))
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.return.status).toBe('PARTIAL');
    expect(res.body.data.limitations).toContain('STALE_END_PRICE');
  });

  it('reconciles contributions with the portfolio return on the same grid', async () => {
    const start = anchorStart();
    const months = monthStartsBetween(start, todaySp());
    const petr = await createAsset();
    const vale = await createAsset();
    await buy(petr.id, '60', '50.00', 'tx-5rb-buy-pa', addDays(start, -12));
    await buy(vale.id, '40', '100.00', 'tx-5rb-buy-pb', addDays(start, -12));
    seedQuote(petr.ticker, '55.00', start);
    seedQuote(vale.ticker, '110.00', start);
    for (const month of months.slice(1)) {
      seedQuote(petr.ticker, '60.50', month);
      seedQuote(vale.ticker, '104.50', month);
    }
    seedQuote(petr.ticker, '60.50', todaySp());
    seedQuote(vale.ticker, '104.50', todaySp());

    const grids = new Map<string, string>();
    for (const asset of [petr, vale]) {
      const res = await request(app.getHttpServer())
        .get(perfUrl(asset.id, portfolioId, `?startDate=${start}`))
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.contribution).not.toBeNull();
      expect(res.body.data.contribution.monthsValued).toBeGreaterThan(0);
      grids.set(asset.id, res.body.data.contribution.portfolioReturnOnGrid as string);
    }
    // Same grid for the same period+portfolio: identical chained portfolio return.
    expect(grids.get(petr.id)).toBe(grids.get(vale.id));

    const petrRes = await request(app.getHttpServer())
      .get(perfUrl(petr.id, portfolioId, `?startDate=${start}`))
      .set('Authorization', `Bearer ${authToken}`);
    const valeRes = await request(app.getHttpServer())
      .get(perfUrl(vale.id, portfolioId, `?startDate=${start}`))
      .set('Authorization', `Bearer ${authToken}`);
    const petrTotal = Number(petrRes.body.data.contribution.totalPp);
    const valeTotal = Number(valeRes.body.data.contribution.totalPp);
    const grid = Number(petrRes.body.data.contribution.portfolioReturnOnGrid);
    // Exact reconciliation: the sum of position contributions equals the
    // chained portfolio return on the same grid (no current-weight math).
    expect(Math.abs(petrTotal + valeTotal - grid)).toBeLessThan(1e-9);
    const data = petrRes.body.data;
    expect(data.contribution.monthlyPoints.length).toBeLessThanOrEqual(120);
    const monthKeys = data.contribution.monthlyPoints.map(
      (point: { month: string }) => point.month,
    );
    expect([...monthKeys].sort()).toEqual(monthKeys);
  });

  it('rejects invalid periods and protects foreign or unknown positions', async () => {
    const asset = await createAsset();
    await buy(asset.id, '10', '30.00', 'tx-5rb-buy-guard', addDays(anchorStart(), -12));

    for (const query of [
      '?startDate=not-a-date',
      '?startDate=2026-05-01&endDate=2026-04-01',
      `?endDate=${todaySp(30)}`,
      `?startDate=${addDays(todaySp(), -2000)}`,
    ]) {
      const res = await request(app.getHttpServer())
        .get(perfUrl(asset.id, portfolioId, query))
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status, query).toBe(400);
    }

    const stranger = randomUUID();
    const strangerPortfolio = randomUUID();
    await prisma.user.create({
      data: { id: stranger, email: 'stranger-5rb@atlas.dev', name: 'S', passwordHash: 'x' },
    });
    await prisma.portfolio.create({
      data: {
        id: strangerPortfolio,
        userId: stranger,
        name: 'SP',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });
    expect(
      (
        await request(app.getHttpServer())
          .get(perfUrl(asset.id, strangerPortfolio))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.getHttpServer())
          .get(perfUrl(randomUUID()))
          .set('Authorization', `Bearer ${authToken}`)
      ).status,
    ).toBe(404);
  });

  it('performs zero writes, stays deterministic and exposes no internal IDs', async () => {
    const start = anchorStart();
    const months = monthStartsBetween(start, todaySp());
    const asset = await createAsset();
    await buy(asset.id, '100', '30.00', 'tx-5rb-buy-ro', addDays(start, -12));
    await income(asset.id, 'DIVIDEND', '150.00', 'tx-5rb-div-ro', addDays(start, 24));
    seedQuote(asset.ticker, '35.00', start);
    for (const month of months.slice(1)) seedQuote(asset.ticker, '38.00', month);
    seedQuote(asset.ticker, '38.50', todaySp());

    const counts = () =>
      Promise.all([prisma.transaction.count({ where: { portfolioId } }), prisma.asset.count()]);
    const before = await counts();
    const first = await request(app.getHttpServer())
      .get(perfUrl(asset.id, portfolioId, `?startDate=${start}`))
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(perfUrl(asset.id, portfolioId, `?startDate=${start}`))
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(await counts()).toEqual(before);
    const { generatedAt: _first, ...firstRest } = first.body.data as Record<string, unknown>;
    const { generatedAt: _second, ...secondRest } = second.body.data as Record<string, unknown>;
    expect(secondRest).toEqual(firstRest);

    const serialized = JSON.stringify(first.body);
    expect(serialized).not.toMatch(
      /passwordHash|refreshToken|externalId|fingerprint|providerSymbol|provider/i,
    );
  });
});
