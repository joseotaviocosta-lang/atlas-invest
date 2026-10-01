import 'reflect-metadata';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from '../api/setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import { Asset } from '@atlas/domain';

interface EquityCategory {
  status: string;
  reasonCode: string | null;
  grossSales: string;
  exemptionStatus: string;
  matchedQuantity: string | null;
  currentResult: string;
  openingLoss: string;
  lossConsumed: string;
  closingLoss: string;
  taxableBaseBeforeRate: string;
  taxRate: string;
  grossTax: string;
  irrfOpening: string;
  irrfCurrent: string;
  irrfUsed: string;
  irrfClosing: string;
  irrfTerminalStatus: string | null;
  netTaxBefore6015Aggregation: string;
  ruleId: string;
}

interface EquityRead {
  status: string;
  reasonCode: string | null;
  normal: EquityCategory;
  dayTrade: EquityCategory;
  compensationElection: {
    required: boolean;
    status: string;
    currentValue: string | null;
    version: number | null;
  };
}

interface LiabilityRead {
  status: string;
  categories: Array<{
    category: string;
    withholdingApplied: { amount: string; currency: string };
    taxDue: { amount: string; currency: string } | null;
  }>;
  equity: EquityRead;
}

/**
 * Phase 4G.2B.1b — REAL end-to-end equity IRRF matrix (A–Q).
 *
 * Every scenario exercises the real HTTP endpoint
 * (`GET /api/v1/fiscal/monthly/:competence/liability`) over a real PostgreSQL
 * ledger, real persisted withholding evidence (`POST /api/v1/fiscal/inputs/withholdings`),
 * the real application service (`GetMonthlyTaxLiabilityUseCase` →
 * `computeEquityMonthlyFiscalRead`), the real monthly replay and the real
 * `@atlas/tax-engine`. No direct engine shortcut.
 */
describe('Phase 4G.2B.1b — real equity IRRF E2E A–Q (real ledger + DB + withholding)', () => {
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

  function uuid(prefix: string): string {
    seq += 1;
    const hex = seq.toString(16).padStart(12, '0');
    return `${prefix}${hex}`
      .padEnd(36, '0')
      .slice(0, 36)
      .replace(/[^0-9a-f]/g, '0');
  }

  async function session(userId: string): Promise<string> {
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@atlas.dev`,
        name: 'Equity IRRF E2E',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
      },
    });
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  async function portfolio(token: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    return res.body.data.id;
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
      .send({ ...body, currency: 'BRL', provider: 'B3', externalId: uuid('e') })
      .expect(201);
  }

  function withholding(
    token: string,
    body: {
      competence: string;
      economicDate: string;
      category: string;
      withholdingCategory?: string;
      amount: string;
      sourceReference: string;
    },
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...body,
        currency: 'BRL',
        status: 'CONFIRMED',
        sourceType: 'MANUAL',
      });
  }

  async function equity(token: string, competence: string): Promise<EquityRead> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/monthly/${competence}/liability`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (res.body.data as LiabilityRead).equity;
  }

  async function liability(token: string, competence: string): Promise<LiabilityRead> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/monthly/${competence}/liability`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.data as LiabilityRead;
  }

  async function putElection(token: string, competence: string, value: string): Promise<void> {
    await request(app.getHttpServer())
      .put(`/api/v1/fiscal/monthly/${competence}/elections/equity-exempt-loss`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value })
      .expect(200);
  }

  async function insertLegacyWithholding(input: {
    taxSubjectId: string;
    competence: string;
    category?: string;
    withholdingCategory: string | null;
    amount: string;
    sourceReference: string;
    fingerprint: string;
  }): Promise<void> {
    await prisma.taxWithholdingInputRecord.create({
      data: {
        taxSubjectId: input.taxSubjectId,
        competence: input.competence,
        economicDate: new Date(`${input.competence}-15T00:00:00.000Z`),
        category: input.category ?? 'BRAZILIAN_EQUITY',
        withholdingCategory: input.withholdingCategory,
        amount: input.amount,
        currency: 'BRL',
        status: 'CONFIRMED',
        sourceType: 'MANUAL',
        sourceReference: input.sourceReference,
        fingerprint: input.fingerprint,
        provenance: {},
        confirmedAt: new Date(),
      },
    });
  }

  it('A. normal taxable month applies 15% and normal IRRF over the real endpoint', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000001');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('PETR4');
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '250',
      unitPrice: '100',
      tradeDate: '2026-07-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '250',
      unitPrice: '104',
      tradeDate: '2026-08-20',
    });
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '3',
      sourceReference: 'n1',
    }).expect(200);

    const eq = await equity(token, '2026-08');
    expect(eq.status).toBe('COMPLETE');
    expect(eq.normal.taxRate).toBe('15');
    expect(eq.normal.taxableBaseBeforeRate).toBe('1000');
    expect(eq.normal.grossTax).toBe('150');
    expect(eq.normal.irrfCurrent).toBe('3');
    expect(eq.normal.irrfUsed).toBe('3');
    expect(eq.normal.netTaxBefore6015Aggregation).toBe('147');
    expect(eq.normal.ruleId).toBe('BR-EQUITY-NORMAL');
  });

  it('B. day trade applies 20% and day-trade IRRF over the real endpoint', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000002');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('VALE3');
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '100',
      tradeDate: '2026-08-10',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '110',
      tradeDate: '2026-08-10',
    });
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-10',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_DAY_TRADE',
      amount: '10',
      sourceReference: 'd1',
    }).expect(200);

    const eq = await equity(token, '2026-08');
    expect(eq.dayTrade.taxRate).toBe('20');
    expect(eq.dayTrade.taxableBaseBeforeRate).toBe('1000');
    expect(eq.dayTrade.grossTax).toBe('200');
    expect(eq.dayTrade.irrfCurrent).toBe('10');
    expect(eq.dayTrade.irrfUsed).toBe('10');
    expect(eq.dayTrade.netTaxBefore6015Aggregation).toBe('190');
    expect(eq.dayTrade.ruleId).toBe('BR-EQUITY-DAY-TRADE');
  });

  it('C. both categories keep separate pools in the same competence', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000003');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('ITUB4');
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '250',
      unitPrice: '100',
      tradeDate: '2026-07-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '250',
      unitPrice: '104',
      tradeDate: '2026-08-20',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '100',
      tradeDate: '2026-08-10',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '110',
      tradeDate: '2026-08-10',
    });
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '3',
      sourceReference: 'n1',
    }).expect(200);
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-10',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_DAY_TRADE',
      amount: '10',
      sourceReference: 'd1',
    }).expect(200);

    const eq = await equity(token, '2026-08');
    expect(eq.normal.grossTax).toBe('150');
    expect(eq.normal.irrfUsed).toBe('3');
    expect(eq.dayTrade.grossTax).toBe('200');
    expect(eq.dayTrade.irrfUsed).toBe('10');
  });

  it('D. unused normal IRRF carries into a later month (same year)', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000004');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('BBDC4');
    // Month 1: exempt profit (gross 10400 <= 20000) → gross tax 0, credit preserved.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '100',
      tradeDate: '2026-06-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '104',
      tradeDate: '2026-06-20',
    });
    // Month 2: taxable gain (gross 26000).
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '250',
      unitPrice: '100',
      tradeDate: '2026-07-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '250',
      unitPrice: '104',
      tradeDate: '2026-07-20',
    });
    await withholding(token, {
      competence: '2026-06',
      economicDate: '2026-06-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '3',
      sourceReference: 'n-jun',
    }).expect(200);

    const eq = await equity(token, '2026-07');
    expect(eq.normal.irrfOpening).toBe('3');
    expect(eq.normal.irrfUsed).toBe('3');
    expect(eq.normal.netTaxBefore6015Aggregation).toBe('147');
  });

  it('E. unused day-trade IRRF carries into a later month (same year)', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000005');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('ABEV3');
    // Month 1: no day trade → day-trade gross 0.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '100',
      tradeDate: '2026-06-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '104',
      tradeDate: '2026-06-20',
    });
    // Month 2: day-trade gain 1000 → gross 200.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '100',
      tradeDate: '2026-07-10',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '110',
      tradeDate: '2026-07-10',
    });
    await withholding(token, {
      competence: '2026-06',
      economicDate: '2026-06-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_DAY_TRADE',
      amount: '10',
      sourceReference: 'd-jun',
    }).expect(200);

    const eq = await equity(token, '2026-07');
    expect(eq.dayTrade.irrfOpening).toBe('10');
    expect(eq.dayTrade.irrfUsed).toBe('10');
    expect(eq.dayTrade.netTaxBefore6015Aggregation).toBe('190');
  });

  it('F. December normal residual is terminal (annual adjustment)', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000006');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('CSNA3');
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '100',
      tradeDate: '2026-12-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '104',
      tradeDate: '2026-12-20',
    });
    await withholding(token, {
      competence: '2026-12',
      economicDate: '2026-12-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '5',
      sourceReference: 'n-dec',
    }).expect(200);

    const dec = await equity(token, '2026-12');
    expect(dec.normal.irrfClosing).toBe('5');
    expect(dec.normal.irrfTerminalStatus).toBe('AVAILABLE_FOR_ANNUAL_ADJUSTMENT');
  });

  it('G. December day-trade residual is restitution-terminal', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000007');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('USIM5');
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '100',
      tradeDate: '2026-12-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '104',
      tradeDate: '2026-12-20',
    });
    await withholding(token, {
      competence: '2026-12',
      economicDate: '2026-12-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_DAY_TRADE',
      amount: '7',
      sourceReference: 'd-dec',
    }).expect(200);

    const dec = await equity(token, '2026-12');
    expect(dec.dayTrade.irrfClosing).toBe('7');
    expect(dec.dayTrade.irrfTerminalStatus).toBe('AVAILABLE_FOR_RESTITUTION');
  });

  it('H. January resets both pools to zero (no automatic carry across the year)', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000008');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('SUZB3');
    // December residuals in both pools.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '100',
      tradeDate: '2026-12-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '104',
      tradeDate: '2026-12-20',
    });
    // January: taxable normal 1000 + day-trade gain 1000.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '250',
      unitPrice: '100',
      tradeDate: '2027-01-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '250',
      unitPrice: '104',
      tradeDate: '2027-01-20',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '100',
      tradeDate: '2027-01-10',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '110',
      tradeDate: '2027-01-10',
    });
    await withholding(token, {
      competence: '2026-12',
      economicDate: '2026-12-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '5',
      sourceReference: 'n-dec',
    }).expect(200);
    await withholding(token, {
      competence: '2026-12',
      economicDate: '2026-12-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_DAY_TRADE',
      amount: '7',
      sourceReference: 'd-dec',
    }).expect(200);

    const jan = await equity(token, '2027-01');
    expect(jan.normal.irrfOpening).toBe('0');
    expect(jan.dayTrade.irrfOpening).toBe('0');
    expect(jan.normal.irrfUsed).toBe('0');
    expect(jan.dayTrade.irrfUsed).toBe('0');
    expect(jan.normal.netTaxBefore6015Aggregation).toBe('150');
    expect(jan.dayTrade.netTaxBefore6015Aggregation).toBe('200');
  });

  it('I. exempt normal month does not consume IRRF credit', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000009');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('GGBR4');
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '100',
      tradeDate: '2026-08-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '104',
      tradeDate: '2026-08-20',
    });
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '5',
      sourceReference: 'n1',
    }).expect(200);

    const eq = await equity(token, '2026-08');
    expect(eq.normal.exemptionStatus).toBe('EXEMPT');
    expect(eq.normal.grossTax).toBe('0');
    expect(eq.normal.irrfUsed).toBe('0');
    expect(eq.normal.irrfClosing).toBe('5');
  });

  it('J. FII coexists with normal and day trade in the same competence without pool bleed', async () => {
    const token = await session('a0000000-0000-4000-8000-00000000000a');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const fii = await asset('MXRF11', 'FII');
    const st = await asset('RENT3');
    // FII round.
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
    // Normal equity round.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '250',
      unitPrice: '100',
      tradeDate: '2026-07-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '250',
      unitPrice: '104',
      tradeDate: '2026-08-20',
    });
    // Day trade.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '100',
      tradeDate: '2026-08-10',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '110',
      tradeDate: '2026-08-10',
    });
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-10',
      category: 'FII',
      amount: '2',
      sourceReference: 'fii-1',
    }).expect(200);
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '3',
      sourceReference: 'n1',
    }).expect(200);
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-10',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_DAY_TRADE',
      amount: '10',
      sourceReference: 'd1',
    }).expect(200);

    const data = await liability(token, '2026-08');
    const fiiCategory = data.categories.find((c) => c.category === 'FII');
    expect(fiiCategory).toBeDefined();
    expect(fiiCategory!.withholdingApplied.amount).toBe('2');
    // Equity pools never include the FII withholding.
    expect(data.equity.normal.irrfCurrent).toBe('3');
    expect(data.equity.normal.irrfUsed).toBe('3');
    expect(data.equity.dayTrade.irrfCurrent).toBe('10');
    expect(data.equity.dayTrade.irrfUsed).toBe('10');
  });

  it('K. duplicate withholding evidence is credited once (no double use)', async () => {
    const token = await session('a0000000-0000-4000-8000-00000000000b');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('BBAS3');
    // Exempt month → credit preserved, isolated from gross tax.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '100',
      tradeDate: '2026-08-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '104',
      tradeDate: '2026-08-20',
    });
    const first = await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '10',
      sourceReference: 'dup',
    }).expect(200);
    const second = await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '10',
      sourceReference: 'dup',
    }).expect(200);
    expect(first.body.data.outcome).toBe('CREATED');
    expect(second.body.data.outcome).toBe('DUPLICATE');
    expect(second.body.data.id).toBe(first.body.data.id);

    const eq = await equity(token, '2026-08');
    expect(eq.normal.irrfCurrent).toBe('10');
    expect(eq.normal.irrfClosing).toBe('10');
  });

  it('L. legacy equity withholding without a discriminator fails closed', async () => {
    const token = await session('a0000000-0000-4000-8000-00000000000c');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('ELET3');
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '250',
      unitPrice: '100',
      tradeDate: '2026-07-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '250',
      unitPrice: '104',
      tradeDate: '2026-08-20',
    });
    await insertLegacyWithholding({
      taxSubjectId: 'a0000000-0000-4000-8000-00000000000c',
      competence: '2026-08',
      withholdingCategory: null,
      amount: '5',
      sourceReference: 'legacy-null',
      fingerprint: 'legacy-null-fp',
    });

    const eq = await equity(token, '2026-08');
    expect(eq.status).toBe('BLOCKED');
    expect(eq.reasonCode).toBe('INCOMPLETE_WITHHOLDING_CLASSIFICATION');
  });

  it('M. unsupported withholding classification fails closed (no guessed mapping)', async () => {
    const token = await session('a0000000-0000-4000-8000-00000000000d');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('CMIG4');
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '250',
      unitPrice: '100',
      tradeDate: '2026-07-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '250',
      unitPrice: '104',
      tradeDate: '2026-08-20',
    });
    await insertLegacyWithholding({
      taxSubjectId: 'a0000000-0000-4000-8000-00000000000d',
      competence: '2026-08',
      withholdingCategory: 'VALUE_GROWTH',
      amount: '5',
      sourceReference: 'malformed-1',
      fingerprint: 'malformed-fp-1',
    });

    const eq = await equity(token, '2026-08');
    expect(eq.status).toBe('BLOCKED');
    expect(eq.reasonCode).toBe('INCOMPLETE_WITHHOLDING_CLASSIFICATION');
    // Blocked month never presents a fabricated conclusion: no net tax.
    expect(eq.normal.netTaxBefore6015Aggregation).toBe('0');
    expect(eq.normal.irrfUsed).toBe('0');
  });

  it('N. a loss month does not consume IRRF credit', async () => {
    const token = await session('a0000000-0000-4000-8000-00000000000e');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('JBSS3');
    // Taxable loss: proceeds 22500 (> 20000), cost 25000 → loss 2500, base 0.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '250',
      unitPrice: '100',
      tradeDate: '2026-07-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '250',
      unitPrice: '90',
      tradeDate: '2026-08-20',
    });
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '5',
      sourceReference: 'n1',
    }).expect(200);

    const eq = await equity(token, '2026-08');
    expect(eq.normal.grossTax).toBe('0');
    expect(eq.normal.irrfUsed).toBe('0');
    expect(eq.normal.irrfClosing).toBe('5');
  });

  it('O. election revision deterministically changes the downstream base and IRRF usage', async () => {
    const token = await session('a0000000-0000-4000-8000-00000000000f');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('PRIO3');
    // M: exempt loss 2000 (gross 18000 <= 20000).
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '200',
      tradeDate: '2026-08-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '180',
      tradeDate: '2026-08-20',
    });
    // M+1: taxable gain 3000 (gross 30000).
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '100',
      unitPrice: '270',
      tradeDate: '2026-09-05',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '100',
      unitPrice: '300',
      tradeDate: '2026-09-20',
    });
    await withholding(token, {
      competence: '2026-09',
      economicDate: '2026-09-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '200',
      sourceReference: 'n-sep',
    }).expect(200);

    const before = await equity(token, '2026-09');
    expect(before.normal.openingLoss).toBe('0');
    expect(before.normal.taxableBaseBeforeRate).toBe('3000');
    expect(before.normal.grossTax).toBe('450');
    expect(before.normal.irrfUsed).toBe('200');
    expect(before.normal.netTaxBefore6015Aggregation).toBe('250');

    await putElection(token, '2026-08', 'DECLARE_FOR_CARRYFORWARD');
    const declared = await equity(token, '2026-09');
    expect(declared.normal.openingLoss).toBe('2000');
    expect(declared.normal.taxableBaseBeforeRate).toBe('1000');
    expect(declared.normal.grossTax).toBe('150');
    expect(declared.normal.irrfUsed).toBe('150');
    expect(declared.normal.netTaxBefore6015Aggregation).toBe('0');
    expect(declared.normal.irrfClosing).toBe('50');

    // A new revision must be replayed deterministically — no stale cached state.
    await putElection(token, '2026-08', 'DO_NOT_DECLARE');
    const declined = await equity(token, '2026-09');
    expect(declined.normal.openingLoss).toBe('0');
    expect(declined.normal.taxableBaseBeforeRate).toBe('3000');
    expect(declined.normal.grossTax).toBe('450');
    expect(declined.normal.irrfUsed).toBe('200');
    expect(declined.normal.netTaxBefore6015Aggregation).toBe('250');
  });

  it('P. same asset mixed normal/day-trade treatment keeps pools separate', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000010');
    const p = await portfolio(token);
    const inst = await institution(token, 'Broker');
    const acct = await account(token, p, inst, 'Conta');
    const st = await asset('WEGE3');
    // Opening inventory: 1000 @ 10 in the prior month.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '1000',
      unitPrice: '10',
      tradeDate: '2026-07-05',
    });
    // Same day: buy 500 @ 10, sell 1200 @ 30 → day trade 500, normal residual 700.
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'BUY',
      quantity: '500',
      unitPrice: '10',
      tradeDate: '2026-08-10',
    });
    await trade(token, p, {
      accountId: acct,
      assetId: st,
      type: 'SELL',
      quantity: '1200',
      unitPrice: '30',
      tradeDate: '2026-08-10',
    });
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-10',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '1000',
      sourceReference: 'n1',
    }).expect(200);
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-10',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_DAY_TRADE',
      amount: '300',
      sourceReference: 'd1',
    }).expect(200);

    const eq = await equity(token, '2026-08');
    expect(eq.dayTrade.matchedQuantity).toBe('500');
    expect(eq.dayTrade.taxableBaseBeforeRate).toBe('10000');
    expect(eq.dayTrade.grossTax).toBe('2000');
    expect(eq.dayTrade.irrfCurrent).toBe('300');
    expect(eq.dayTrade.irrfUsed).toBe('300');
    expect(eq.normal.grossSales).toBe('21000');
    expect(eq.normal.taxableBaseBeforeRate).toBe('14000');
    expect(eq.normal.grossTax).toBe('2100');
    expect(eq.normal.irrfCurrent).toBe('1000');
    expect(eq.normal.irrfUsed).toBe('1000');
    expect(eq.normal.irrfClosing).toBe('0');
    expect(eq.dayTrade.irrfClosing).toBe('0');
  });

  it('Q. multi-institution matching is institution-isolated and IRRF stays category-driven', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000011');
    const p = await portfolio(token);
    const instA = await institution(token, 'Broker A');
    const instB = await institution(token, 'Broker B');
    const acctA = await account(token, p, instA, 'A');
    const acctB = await account(token, p, instB, 'B');
    const st = await asset('MGLU3');
    await trade(token, p, {
      accountId: acctA,
      assetId: st,
      type: 'BUY',
      quantity: '1500',
      unitPrice: '10',
      tradeDate: '2026-07-05',
    });
    // Same day buy on institution B and sell on institution A → no day trade.
    await trade(token, p, {
      accountId: acctB,
      assetId: st,
      type: 'BUY',
      quantity: '500',
      unitPrice: '10',
      tradeDate: '2026-08-10',
    });
    await trade(token, p, {
      accountId: acctA,
      assetId: st,
      type: 'SELL',
      quantity: '1200',
      unitPrice: '30',
      tradeDate: '2026-08-10',
    });
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-10',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '500',
      sourceReference: 'n1',
    }).expect(200);

    const eq = await equity(token, '2026-08');
    expect(eq.dayTrade.matchedQuantity).toBe('0');
    expect(eq.normal.grossSales).toBe('36000');
    expect(eq.normal.taxableBaseBeforeRate).toBe('24000');
    expect(eq.normal.grossTax).toBe('3600');
    // IRRF is applied by explicit category, never inferred from institution.
    expect(eq.normal.irrfCurrent).toBe('500');
    expect(eq.normal.irrfUsed).toBe('500');
    expect(eq.dayTrade.irrfCurrent).toBe('0');
    expect(eq.dayTrade.irrfUsed).toBe('0');
  });

  it('Q2. same institution may span accounts for day-trade matching', async () => {
    const token = await session('a0000000-0000-4000-8000-000000000012');
    const p = await portfolio(token);
    const inst = await institution(token, 'Shared Broker');
    const acct1 = await account(token, p, inst, 'A1');
    const acct2 = await account(token, p, inst, 'A2');
    const st = await asset('CCRO3');
    await trade(token, p, {
      accountId: acct1,
      assetId: st,
      type: 'BUY',
      quantity: '1500',
      unitPrice: '10',
      tradeDate: '2026-07-05',
    });
    await trade(token, p, {
      accountId: acct2,
      assetId: st,
      type: 'BUY',
      quantity: '500',
      unitPrice: '10',
      tradeDate: '2026-08-10',
    });
    await trade(token, p, {
      accountId: acct1,
      assetId: st,
      type: 'SELL',
      quantity: '1200',
      unitPrice: '30',
      tradeDate: '2026-08-10',
    });

    const eq = await equity(token, '2026-08');
    expect(eq.dayTrade.matchedQuantity).toBe('500');
  });
});
