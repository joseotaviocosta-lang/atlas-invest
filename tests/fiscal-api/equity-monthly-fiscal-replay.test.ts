import 'reflect-metadata';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from '../api/setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import { Asset } from '@atlas/domain';

interface EquityRead {
  status: string;
  reasonCode: string | null;
  normal: Record<string, string>;
  dayTrade: Record<string, string>;
  compensationElection: {
    required: boolean;
    status: string;
    currentValue: string | null;
    version: number | null;
    fingerprint: string | null;
  };
}

describe('API Integration: real equity monthly fiscal replay (Phase 4G.2A.1b.1)', () => {
  let app: INestApplication;
  const prisma = getTestPrismaClient();
  let seq = 0;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp();
  });
  beforeEach(async () => {
    await cleanDatabase();
    seq = 0;
  });

  async function session(userId: string): Promise<string> {
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Equity Tester',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  function uuid(prefix: string): string {
    seq += 1;
    const hex = seq.toString(16).padStart(12, '0');
    return `${prefix}${hex}`
      .padEnd(36, '0')
      .slice(0, 36)
      .replace(/[^0-9a-f]/g, '0');
  }

  async function institution(token: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, type: 'BROKER', country: 'BR' })
      .expect(201);
    return res.body.data.id;
  }

  async function account(
    token: string,
    portfolioId: string,
    institutionId: string,
    name: string,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId, name, currency: 'BRL' })
      .expect(201);
    return res.body.data.id;
  }

  async function portfolio(token: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    return res.body.data.id;
  }

  async function asset(ticker: string, type = 'STOCK'): Promise<string> {
    const created = Asset.create({
      ticker,
      name: `Asset ${ticker}`,
      type: type as never,
      currency: 'BRL',
      exchange: 'B3',
    });
    await prisma.asset.create({
      data: {
        id: created.id,
        ticker: created.ticker,
        name: created.name,
        type: created.type,
        currency: created.currency,
        exchange: created.exchange,
      },
    });
    return created.id;
  }

  async function trade(
    token: string,
    portfolioId: string,
    body: {
      accountId: string;
      assetId: string;
      type: 'BUY' | 'SELL';
      quantity: string;
      unitPrice: string;
      tradeDate: string;
    },
  ): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...body,
        currency: 'BRL',
        provider: 'B3',
        externalId: uuid('e'),
      })
      .expect(201);
  }

  async function equity(token: string, competence: string): Promise<EquityRead> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/monthly/${competence}/liability`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.data.equity as EquityRead;
  }

  async function putElection(token: string, competence: string, value: string): Promise<void> {
    await request(app.getHttpServer())
      .put(`/api/v1/fiscal/monthly/${competence}/elections/equity-exempt-loss`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value })
      .expect(200);
  }

  /** A normal (non-day-trade) buy then sell on distinct days. */
  async function normalRound(
    token: string,
    portfolioId: string,
    accountId: string,
    assetId: string,
    month: string,
    buyPrice: string,
    sellPrice: string,
    quantity = '100',
  ): Promise<void> {
    await trade(token, portfolioId, {
      accountId,
      assetId,
      type: 'BUY',
      quantity,
      unitPrice: buyPrice,
      tradeDate: `${month}-05`,
    });
    await trade(token, portfolioId, {
      accountId,
      assetId,
      type: 'SELL',
      quantity,
      unitPrice: sellPrice,
      tradeDate: `${month}-20`,
    });
  }

  it('T. no equity activity yields a stable zero model', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000001');
    const eq = await equity(token, '2026-08');
    expect(eq.status).toBe('COMPLETE');
    expect(eq.normal.grossSales).toBe('0');
    expect(eq.normal.exemptionStatus).toBe('EXEMPT');
    expect(eq.dayTrade.matchedQuantity).toBe('0');
    expect(eq.compensationElection.required).toBe(false);
  });

  it('A. exempt profit preserves prior normal loss', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000002');
    const p = await portfolio(token, 'P');
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('PETR4');
    // Prior month: taxable loss of exactly 5000 (gross 45000 > 20000).
    await normalRound(token, p, acct, st, '2026-07', '100', '90', '500');
    // Requested month: exempt profit of 2000 (gross 18000 <= 20000).
    await normalRound(token, p, acct, st, '2026-08', '160', '180', '100');

    const eq = await equity(token, '2026-08');
    expect(eq.normal.exemptionStatus).toBe('EXEMPT');
    expect(eq.normal.openingLoss).toBe('5000');
    expect(eq.normal.lossConsumed).toBe('0');
    expect(eq.normal.closingLoss).toBe('5000');
    expect(eq.normal.taxableBaseBeforeRate).toBe('0');
    expect(eq.compensationElection.required).toBe(false);
  });

  it('B. taxable profit consumes prior normal loss', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000003');
    const p = await portfolio(token, 'P');
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('VALE3');
    await normalRound(token, p, acct, st, '2026-07', '100', '90', '500');
    // Taxable profit 2000 with gross 25000 > 20000.
    await normalRound(token, p, acct, st, '2026-08', '230', '250', '100');

    const eq = await equity(token, '2026-08');
    expect(eq.normal.exemptionStatus).toBe('TAXABLE');
    expect(eq.normal.lossConsumed).toBe('2000');
    expect(eq.normal.closingLoss).toBe('3000');
    expect(eq.normal.taxableBaseBeforeRate).toBe('0');
  });

  it('C/D/E. exempt loss requires and honors the persisted election', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000004');
    const p = await portfolio(token, 'P');
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('ITUB4');
    // Exempt loss of 2000 (gross 18000 <= 20000).
    await normalRound(token, p, acct, st, '2026-08', '200', '180', '100');

    const missing = await equity(token, '2026-08');
    expect(missing.compensationElection.status).toBe('ELECTION_REQUIRED');
    expect(missing.normal.lossAdded).toBe('0');

    await putElection(token, '2026-08', 'DECLARE_FOR_CARRYFORWARD');
    const declared = await equity(token, '2026-08');
    expect(declared.normal.lossAdded).toBe('2000');
    expect(declared.normal.closingLoss).toBe('2000');
    expect(declared.compensationElection.status).toBe('DECLARED');
    expect(declared.compensationElection.version).toBe(1);

    await putElection(token, '2026-08', 'DO_NOT_DECLARE');
    const declined = await equity(token, '2026-08');
    expect(declined.normal.lossAdded).toBe('0');
    expect(declined.compensationElection.status).toBe('NOT_DECLARED');
    expect(declined.compensationElection.version).toBe(2);
  });

  it('F/G. election revision affects downstream replay but not prior months', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000005');
    const p = await portfolio(token, 'P');
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('BBDC4');
    // M = 2026-08 exempt loss 2000; M+1 = 2026-09 taxable gain 3000.
    await normalRound(token, p, acct, st, '2026-08', '200', '180', '100');
    await normalRound(token, p, acct, st, '2026-09', '270', '300', '100');

    const priorBefore = await equity(token, '2026-08');
    await putElection(token, '2026-08', 'DECLARE_FOR_CARRYFORWARD');
    const withDeclare = await equity(token, '2026-09');
    expect(withDeclare.normal.openingLoss).toBe('2000');
    expect(withDeclare.normal.lossConsumed).toBe('2000');
    expect(withDeclare.normal.taxableBaseBeforeRate).toBe('1000');

    await putElection(token, '2026-08', 'DO_NOT_DECLARE');
    const withDecline = await equity(token, '2026-09');
    expect(withDecline.normal.openingLoss).toBe('0');
    expect(withDecline.normal.taxableBaseBeforeRate).toBe('3000');

    // Prior month (M) result is unchanged by the M-election revision.
    const priorAfter = await equity(token, '2026-08');
    expect(priorAfter.normal.closingLoss).toBe(priorBefore.normal.closingLoss);
  });

  it('H. partial day-trade split allocates cost only to the normal residual', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000006');
    const p = await portfolio(token, 'P');
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('ABEV3');
    // Opening inventory: 100 @ 10 in the prior month.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '10',
      tradeDate: '2026-07-05',
    });
    // Same day: buy 50 @ 10, sell 120 @ 12 → day trade 50, normal residual 70.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '50',
      unitPrice: '10',
      tradeDate: '2026-08-10',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '120',
      unitPrice: '12',
      tradeDate: '2026-08-10',
    });

    const eq = await equity(token, '2026-08');
    expect(eq.dayTrade.matchedQuantity).toBe('50');
    expect(eq.dayTrade.currentResult).toBe('100');
    expect(eq.normal.grossSales).toBe('840');
    expect(eq.normal.currentResult).toBe('140');
  });

  it('J. same-day trades across different institutions are not day trade', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000007');
    const p = await portfolio(token, 'P');
    const instA = await institution(token, 'Broker A');
    const instB = await institution(token, 'Broker B');
    const acctA = await account(token, p, instA, 'A');
    const acctB = await account(token, p, instB, 'B');
    const st = await asset('MGLU3');
    await trade(token, p, {
      accountId: acctA,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '10',
      tradeDate: '2026-07-05',
    });
    await trade(token, p, {
      accountId: acctB,
      assetId: st,
      type: 'BUY',
      quantity: '50',
      unitPrice: '10',
      tradeDate: '2026-08-10',
    });
    await trade(token, p, {
      accountId: acctA,
      assetId: st,
      type: 'SELL',
      quantity: '120',
      unitPrice: '12',
      tradeDate: '2026-08-10',
    });

    const eq = await equity(token, '2026-08');
    expect(eq.dayTrade.matchedQuantity).toBe('0');
    expect(eq.normal.grossSales).toBe('1440');
  });

  it('K. same-institution multi-account executions may match', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000008');
    const p = await portfolio(token, 'P');
    const inst = await institution(token, 'Shared Broker');
    const acct1 = await account(token, p, inst, 'A1');
    const acct2 = await account(token, p, inst, 'A2');
    const st = await asset('BBAS3');
    await trade(token, p, {
      accountId: acct1,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '10',
      tradeDate: '2026-07-05',
    });
    await trade(token, p, {
      accountId: acct2,
      assetId: st,
      type: 'BUY',
      quantity: '50',
      unitPrice: '10',
      tradeDate: '2026-08-10',
    });
    await trade(token, p, {
      accountId: acct1,
      assetId: st,
      type: 'SELL',
      quantity: '120',
      unitPrice: '12',
      tradeDate: '2026-08-10',
    });

    const eq = await equity(token, '2026-08');
    expect(eq.dayTrade.matchedQuantity).toBe('50');
  });

  it('L. unknown asset classification blocks the monthly result', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000009');
    const p = await portfolio(token, 'P');
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('XPTO11', 'FUND');
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '10',
      tradeDate: '2026-07-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '12',
      tradeDate: '2026-08-10',
    });

    const eq = await equity(token, '2026-08');
    expect(eq.status).toBe('BLOCKED');
    expect(eq.reasonCode).toBe('UNKNOWN_ASSET_TAX_CLASSIFICATION');
    expect(eq.normal.exemptionStatus).toBe('NOT_APPLICABLE');
  });

  it('O. exemption threshold boundary is exact', async () => {
    async function scenario(userId: string, price: string): Promise<string> {
      const token = await session(userId);
      const p = await portfolio(token, 'P');
      const inst = await institution(token, 'Broker');
      const acct = await account(token, p, inst, 'Conta');
      const st = await asset(`T${seq}`);
      await trade(token, p, {
        accountId: acct,
        assetId: st,
        type: 'BUY',
        quantity: '1',
        unitPrice: '100',
        tradeDate: '2026-07-05',
      });
      await trade(token, p, {
        accountId: acct,
        assetId: st,
        type: 'SELL',
        quantity: '1',
        unitPrice: price,
        tradeDate: '2026-08-20',
      });
      return (await equity(token, '2026-08')).normal.exemptionStatus;
    }
    expect(await scenario('a0000000-0000-4000-8000-00000000000a', '19999.99')).toBe('EXEMPT');
    expect(await scenario('a0000000-0000-4000-8000-00000000000b', '20000')).toBe('EXEMPT');
    expect(await scenario('a0000000-0000-4000-8000-00000000000c', '20000.01')).toBe('TAXABLE');
  });

  it('P. normal and day-trade buckets never cross-offset', async () => {
    const token = await session('a0000000-0000-4000-8000-00000000000d');
    const p = await portfolio(token, 'P');
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('CSNA3');
    // Prior normal taxable loss 5000.
    await normalRound(token, p, acct, st, '2026-07', '100', '90', '500');
    // Requested month: day-trade gain 2000 (same-day buy 100 @ 10, sell 100 @ 30).
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '10',
      tradeDate: '2026-08-10',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '30',
      tradeDate: '2026-08-10',
    });

    const eq = await equity(token, '2026-08');
    expect(eq.normal.openingLoss).toBe('5000');
    expect(eq.normal.closingLoss).toBe('5000');
    expect(eq.dayTrade.taxableBaseBeforeRate).toBe('2000');
  });

  it('Q. multi-month normal loss chain carries forward', async () => {
    const token = await session('a0000000-0000-4000-8000-00000000000e');
    const p = await portfolio(token, 'P');
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('GGBR4');
    // M1 loss 1000, M2 loss 500, M3 gain 2000 (all taxable, gross > 20000).
    await normalRound(token, p, acct, st, '2026-06', '100', '98', '500');
    await normalRound(token, p, acct, st, '2026-07', '100', '99', '500');
    await normalRound(token, p, acct, st, '2026-08', '100', '104', '500');

    const eq = await equity(token, '2026-08');
    expect(eq.normal.openingLoss).toBe('1500');
    expect(eq.normal.lossConsumed).toBe('1500');
    expect(eq.normal.taxableBaseBeforeRate).toBe('500');
  });

  it('R. multi-month day-trade loss chain carries forward separately', async () => {
    const token = await session('a0000000-0000-4000-8000-00000000000f');
    const p = await portfolio(token, 'P');
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('USIM5');
    async function dayRound(month: string, buy: string, sell: string): Promise<void> {
      await trade(token, p, {
        accountId: acct,
        assetId: st,
        type: 'BUY',
        quantity: '100',
        unitPrice: buy,
        tradeDate: `${month}-10`,
      });
      await trade(token, p, {
        accountId: acct,
        assetId: st,
        type: 'SELL',
        quantity: '100',
        unitPrice: sell,
        tradeDate: `${month}-10`,
      });
    }
    // M1 day-trade loss 1000, M2 day-trade loss 500, M3 day-trade gain 2000.
    await dayRound('2026-06', '20', '10');
    await dayRound('2026-07', '15', '10');
    await dayRound('2026-08', '10', '30');

    const eq = await equity(token, '2026-08');
    expect(eq.dayTrade.openingLoss).toBe('1500');
    expect(eq.dayTrade.lossConsumed).toBe('1500');
    expect(eq.dayTrade.taxableBaseBeforeRate).toBe('500');
  });

  it('S. equity is additive and does not change the existing FII response', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000010');
    const p = await portfolio(token, 'P');
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const fii = await asset('MXRF11', 'FII');
    const st = await asset('RENT3');
    await trade(token, p, {
      accountId: acct,
      assetId: fii,
      type: 'BUY',
      quantity: '100',
      unitPrice: '10',
      tradeDate: '2026-07-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: fii,
      type: 'SELL',
      quantity: '100',
      unitPrice: '12',
      tradeDate: '2026-08-10',
    });
    await normalRound(token, p, acct, st, '2026-08', '100', '104', '500');

    const res = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-08/liability')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.equity).toBeDefined();
    expect(Array.isArray(res.body.data.categories)).toBe(true);
    expect(res.body.data.categories.length).toBeGreaterThan(0);
  });

  it('I. sale before buy on the same day still matches as day trade', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000011');
    const p = await portfolio(token, 'P');
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('SUZB3');
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '10',
      tradeDate: '2026-07-05',
    });
    // Sell first, then buy, on the same day.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '50',
      unitPrice: '12',
      tradeDate: '2026-08-10',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '50',
      unitPrice: '10',
      tradeDate: '2026-08-10',
    });

    const eq = await equity(token, '2026-08');
    expect(eq.dayTrade.matchedQuantity).toBe('50');
    expect(eq.dayTrade.currentResult).toBe('100');
  });

  it('N. missing canonical cost basis blocks the monthly result', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000012');
    const p = await portfolio(token, 'P');
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('ELET3');
    // Unmatched transfer-in carries no cost basis → position INCOMPLETE.
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${p}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId: acct,
        assetId: st,
        type: 'TRANSFER_IN',
        quantity: '100',
        currency: 'BRL',
        tradeDate: '2026-07-05',
        provider: 'B3',
        externalId: uuid('t'),
      })
      .expect(201);
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '12',
      tradeDate: '2026-08-20',
    });

    const eq = await equity(token, '2026-08');
    expect(eq.status).toBe('BLOCKED');
    expect(eq.reasonCode).toBe('MISSING_CANONICAL_COST_BASIS');
  });
});
