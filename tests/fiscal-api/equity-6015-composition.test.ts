import 'reflect-metadata';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/main';
import { PRISMA_CLIENT } from '../../apps/api/src/database/tokens';
import { FISCAL_CLOCK } from '../../apps/api/src/application/fiscal/tokens';
import { createAuthenticatedUserSession, getTestPrismaClient, cleanDatabase } from '../api/setup';
import { Asset } from '@atlas/domain';

const prisma = getTestPrismaClient();
const CLOCK = '2026-10-01';
const COMP = '2026-09';

/**
 * Phase 4G.2C — real end-to-end 6015 composition (FII + normal equity + day
 * trade) through the existing obligation / minimum-DARF / carry / deadline /
 * overdue / DARF-handoff pipeline. Real HTTP + real DB + real ledger + real
 * equity replay + real FII liability. No engine shortcut, no mocked backend.
 *
 * Convention (as in 4C/4E): a canonical FII withholding of R$ 0,10 must exist for
 * the FII category to be COMPLETE, so FII net tax = 0.20 * gain - 0.10.
 */
async function buildApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRISMA_CLIENT)
    .useValue(prisma)
    .overrideProvider(FISCAL_CLOCK)
    .useValue({ today: () => CLOCK })
    .compile();
  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('API Integration: 6015 obligation composition (Phase 4G.2C)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await cleanDatabase();
  });

  async function session(userId: string): Promise<string> {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@atlas.dev`,
          name: 'T',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$abcdefghijklmnopqrstuvwxyz0123456789',
        },
      });
    }
    const { token } = await createAuthenticatedUserSession(userId);
    return token;
  }

  async function setup(userId: string) {
    const token = await session(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id as string;
    const inst = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Corretora', type: 'BANK', country: 'BR' })
      .expect(201);
    const accountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ institutionId: inst.body.data.id, name: 'Conta', currency: 'BRL' })
      .expect(201);
    const accountId = accountRes.body.data.id as string;

    const makeAsset = async (ticker: string, type: string) => {
      const asset = Asset.create({
        ticker,
        name: ticker,
        type: type as never,
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
      return asset.id as string;
    };
    const stock = await makeAsset('PETR4', 'STOCK');
    const fii = await makeAsset('MXRF11', 'FII');
    return { token, portfolioId, accountId, stock, fii };
  }

  async function trade(
    token: string,
    portfolioId: string,
    accountId: string,
    assetId: string,
    type: 'BUY' | 'SELL',
    tradeDate: string,
    unitPrice: string,
    quantity: string,
    externalId: string,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        assetId,
        type,
        quantity,
        unitPrice,
        currency: 'BRL',
        tradeDate,
        provider: 'B3',
        externalId,
      })
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
      .send({ ...body, currency: 'BRL', status: 'CONFIRMED', sourceType: 'MANUAL' });
  }

  function obligation(token: string, competence: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/fiscal/monthly/${competence}/obligation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .then((res) => res.body.data);
  }

  function summary(token: string, competence: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/fiscal/monthly/${competence}/payment-summary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .then((res) => res.body.data);
  }

  function readiness(token: string, obligationId: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/fiscal/obligations/${obligationId}/darf-readiness`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .then((res) => res.body.data);
  }

  function handoff(token: string, obligationId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/fiscal/obligations/${obligationId}/darf-handoff`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200)
      .then((res) => res.body.data);
  }

  async function insertLegacyEquityWithholding(userId: string, competence: string): Promise<void> {
    await prisma.taxWithholdingInputRecord.create({
      data: {
        taxSubjectId: userId,
        competence,
        economicDate: new Date(`${competence}-15T00:00:00.000Z`),
        category: 'BRAZILIAN_EQUITY',
        withholdingCategory: null,
        amount: '5',
        currency: 'BRL',
        status: 'CONFIRMED',
        sourceType: 'MANUAL',
        sourceReference: `legacy-${competence}`,
        fingerprint: `legacy-fp-${competence}`,
        provenance: {},
        confirmedAt: new Date(),
      },
    });
  }

  function componentTotal(
    data: {
      composition: {
        components: { category: string; netCategoryTax: { amount: string } | null }[];
      };
    },
    category: string,
  ): string | null {
    const c = data.composition.components.find((x) => x.category === category);
    return c?.netCategoryTax?.amount ?? null;
  }

  // --- A: normal only ---
  it('A. normal equity only composes a single 6015 obligation', async () => {
    const userId = 'c1000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, stock } = await setup(userId);
    await trade(token, portfolioId, accountId, stock, 'BUY', '2026-08-05', '100', '250', 'b1');
    await trade(token, portfolioId, accountId, stock, 'SELL', '2026-09-20', '104', '250', 's1');

    const obl = await obligation(token, COMP);
    expect(obl.revenueCode).toBe('6015');
    expect(obl.taxBucket).toBe('FII_SALE');
    expect(obl.principalAmount).toEqual({ amount: '150', currency: 'BRL' });
    expect(obl.dueDate).toBe('2026-10-30');
    expect(obl.status).toBe('OPEN');
    expect(obl.composition.status).toBe('COMPLETE');
    expect(obl.composition.total).toEqual({ amount: '150', currency: 'BRL' });
    expect(componentTotal(obl, 'FII')).toBe('0');
    expect(componentTotal(obl, 'EQUITY_NORMAL')).toBe('150');
    expect(componentTotal(obl, 'EQUITY_DAY_TRADE')).toBe('0');
  });

  // --- B: day trade only ---
  it('B. day-trade only composes a single 6015 obligation', async () => {
    const userId = 'c2000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, stock } = await setup(userId);
    await trade(token, portfolioId, accountId, stock, 'BUY', '2026-09-10', '100', '100', 'b1');
    await trade(token, portfolioId, accountId, stock, 'SELL', '2026-09-10', '110', '100', 's1');

    const obl = await obligation(token, COMP);
    expect(obl.composition.total).toEqual({ amount: '200', currency: 'BRL' });
    expect(componentTotal(obl, 'EQUITY_DAY_TRADE')).toBe('200');
    expect(componentTotal(obl, 'EQUITY_NORMAL')).toBe('0');
  });

  // --- C: FII only (existing behavior preserved) ---
  it('C. FII-only composes a single 6015 obligation (preserved)', async () => {
    const userId = 'c3000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, fii } = await setup(userId);
    await trade(token, portfolioId, accountId, fii, 'BUY', '2026-09-01', '10', '100', 'b1');
    await trade(token, portfolioId, accountId, fii, 'SELL', '2026-09-10', '20', '100', 's1');
    await withholding(token, {
      competence: COMP,
      economicDate: '2026-09-10',
      category: 'FII',
      amount: '0.1',
      sourceReference: 'fii-1',
    }).expect(200);

    const obl = await obligation(token, COMP);
    expect(obl.revenueCode).toBe('6015');
    expect(obl.composition.total).toEqual({ amount: '199.9', currency: 'BRL' });
    expect(componentTotal(obl, 'FII')).toBe('199.9');
    expect(componentTotal(obl, 'EQUITY_NORMAL')).toBe('0');
    expect(componentTotal(obl, 'EQUITY_DAY_TRADE')).toBe('0');
  });

  // --- D: all three ---
  it('D. FII + normal + day trade compose one obligation with three components', async () => {
    const userId = 'c4000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, stock, fii } = await setup(userId);
    await trade(token, portfolioId, accountId, fii, 'BUY', '2026-09-01', '10', '100', 'f1');
    await trade(token, portfolioId, accountId, fii, 'SELL', '2026-09-10', '20', '100', 'f2');
    await trade(token, portfolioId, accountId, stock, 'BUY', '2026-08-05', '100', '250', 'b1');
    await trade(token, portfolioId, accountId, stock, 'SELL', '2026-09-20', '104', '250', 's1');
    await trade(token, portfolioId, accountId, stock, 'BUY', '2026-09-10', '100', '100', 'd1');
    await trade(token, portfolioId, accountId, stock, 'SELL', '2026-09-10', '110', '100', 'd2');
    await withholding(token, {
      competence: COMP,
      economicDate: '2026-09-10',
      category: 'FII',
      amount: '0.1',
      sourceReference: 'fii-1',
    }).expect(200);

    const obl = await obligation(token, COMP);
    expect(obl.composition.total).toEqual({ amount: '549.9', currency: 'BRL' });
    expect(componentTotal(obl, 'FII')).toBe('199.9');
    expect(componentTotal(obl, 'EQUITY_NORMAL')).toBe('150');
    expect(componentTotal(obl, 'EQUITY_DAY_TRADE')).toBe('200');
    expect(obl.composition.components).toHaveLength(3);
  });

  // --- E: below minimum ---
  it('E. below the minimum composes then defers via 4E carry (no payable DARF)', async () => {
    const userId = 'c5000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, fii } = await setup(userId);
    await trade(token, portfolioId, accountId, fii, 'BUY', '2026-09-01', '10', '100', 'b1');
    await trade(token, portfolioId, accountId, fii, 'SELL', '2026-09-10', '10.5', '100', 's1');
    await withholding(token, {
      competence: COMP,
      economicDate: '2026-09-10',
      category: 'FII',
      amount: '0.1',
      sourceReference: 'fii-1',
    }).expect(200);

    const data = await summary(token, COMP);
    expect(data.composition.total).toEqual({ amount: '9.9', currency: 'BRL' });
    expect(data.eligibility.status).toBe('CARRIED_FORWARD');
    expect(data.eligibility.currentAmount).toEqual({ amount: '9.9', currency: 'BRL' });
    expect(data.openCarryForwardEntries).toHaveLength(1);
    expect(data.obligation.status).not.toBe('PAID');
  });

  // --- F: exact minimum ---
  it('F. exact minimum (R$ 10,00) is payable', async () => {
    const userId = 'c6000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, fii } = await setup(userId);
    await trade(token, portfolioId, accountId, fii, 'BUY', '2026-09-01', '10', '100', 'b1');
    await trade(token, portfolioId, accountId, fii, 'SELL', '2026-09-10', '10.505', '100', 's1');
    await withholding(token, {
      competence: COMP,
      economicDate: '2026-09-10',
      category: 'FII',
      amount: '0.1',
      sourceReference: 'fii-1',
    }).expect(200);

    const data = await summary(token, COMP);
    expect(data.composition.total).toEqual({ amount: '10', currency: 'BRL' });
    expect(data.eligibility.status).toBe('PAYABLE');
    expect(data.eligibility.totalPayable).toEqual({ amount: '10', currency: 'BRL' });
  });

  // --- G: above minimum ---
  it('G. above the minimum is payable', async () => {
    const userId = 'c7000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, fii } = await setup(userId);
    await trade(token, portfolioId, accountId, fii, 'BUY', '2026-09-01', '10', '100', 'b1');
    await trade(token, portfolioId, accountId, fii, 'SELL', '2026-09-10', '20', '100', 's1');
    await withholding(token, {
      competence: COMP,
      economicDate: '2026-09-10',
      category: 'FII',
      amount: '0.1',
      sourceReference: 'fii-1',
    }).expect(200);

    const data = await summary(token, COMP);
    expect(data.composition.total).toEqual({ amount: '199.9', currency: 'BRL' });
    expect(data.eligibility.status).toBe('PAYABLE');
  });

  // --- H: prior carry + current ---
  it('H. prior 6015 carry + current components cross the threshold', async () => {
    const userId = 'c8000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, fii } = await setup(userId);
    // 2026-08: FII gain 50 → 9.9 (carried).
    await trade(token, portfolioId, accountId, fii, 'BUY', '2026-08-01', '10', '100', 'b0');
    await trade(token, portfolioId, accountId, fii, 'SELL', '2026-08-10', '10.5', '100', 's0');
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-10',
      category: 'FII',
      amount: '0.1',
      sourceReference: 'fii-aug',
    }).expect(200);
    const aug = await summary(token, '2026-08');
    expect(aug.eligibility.status).toBe('CARRIED_FORWARD');

    // 2026-09: FII gain 5.5 → 1.0; carry 9.9 → total 10.9 payable.
    await trade(token, portfolioId, accountId, fii, 'BUY', '2026-09-01', '10', '100', 'b1');
    await trade(token, portfolioId, accountId, fii, 'SELL', '2026-09-10', '10.055', '100', 's1');
    await withholding(token, {
      competence: COMP,
      economicDate: '2026-09-10',
      category: 'FII',
      amount: '0.1',
      sourceReference: 'fii-sep',
    }).expect(200);

    const sep = await summary(token, COMP);
    expect(sep.eligibility.status).toBe('PAYABLE');
    expect(sep.eligibility.currentAmount).toEqual({ amount: '1', currency: 'BRL' });
    expect(sep.eligibility.carryForwardAmount).toEqual({ amount: '9.9', currency: 'BRL' });
    expect(sep.eligibility.totalPayable).toEqual({ amount: '10.9', currency: 'BRL' });
  });

  // --- I: multi-month carry ---
  it('I. multiple sub-minimum months accumulate deterministically', async () => {
    const userId = 'c9000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, stock } = await setup(userId);
    async function dayRound(
      date: string,
      buy: string,
      sell: string,
      suffix: string,
    ): Promise<void> {
      await trade(token, portfolioId, accountId, stock, 'BUY', date, buy, '100', `b-${suffix}`);
      await trade(token, portfolioId, accountId, stock, 'SELL', date, sell, '100', `s-${suffix}`);
    }
    // Day trade (no exemption): gain 24.5 → 4.9 ; gain 24.5 → 4.9 ; gain 29.5 → 5.9
    await dayRound('2025-07-10', '10', '10.245', 'a');
    await dayRound('2026-08-10', '10', '10.245', 'b');
    await dayRound('2026-09-10', '10', '10.295', 'c');

    expect((await summary(token, '2025-07')).eligibility.status).toBe('CARRIED_FORWARD');
    const b = await summary(token, '2026-08');
    expect(b.eligibility.status).toBe('CARRIED_FORWARD');
    expect(b.eligibility.totalPayable).toEqual({ amount: '9.8', currency: 'BRL' });

    const c = await summary(token, COMP);
    expect(c.eligibility.status).toBe('PAYABLE');
    expect(c.eligibility.currentAmount).toEqual({ amount: '5.9', currency: 'BRL' });
    expect(c.eligibility.carryForwardAmount).toEqual({ amount: '9.8', currency: 'BRL' });
    expect(c.eligibility.totalPayable).toEqual({ amount: '15.7', currency: 'BRL' });
  });

  // --- J/K: blocked component blocks the final obligation ---
  it('J/K. a blocked equity component blocks the final 6015 obligation', async () => {
    const userId = 'ca000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, stock, fii } = await setup(userId);
    await trade(token, portfolioId, accountId, stock, 'BUY', '2026-08-05', '100', '250', 'b1');
    await trade(token, portfolioId, accountId, stock, 'SELL', '2026-09-20', '104', '250', 's1');
    await trade(token, portfolioId, accountId, stock, 'BUY', '2026-09-10', '100', '100', 'd1');
    await trade(token, portfolioId, accountId, stock, 'SELL', '2026-09-10', '110', '100', 'd2');
    await trade(token, portfolioId, accountId, fii, 'BUY', '2026-09-01', '10', '100', 'f1');
    await trade(token, portfolioId, accountId, fii, 'SELL', '2026-09-10', '20', '100', 'f2');
    await withholding(token, {
      competence: COMP,
      economicDate: '2026-09-10',
      category: 'FII',
      amount: '0.1',
      sourceReference: 'fii-1',
    }).expect(200);
    // Incomplete equity IRRF classification blocks the competence.
    await insertLegacyEquityWithholding(userId, COMP);

    const obl = await obligation(token, COMP);
    expect(obl.status).toBe('BLOCKED');
    expect(obl.baseStatus).toBe('BLOCKED');
    expect(obl.principalAmount).toBeNull();
    expect(obl.composition.status).toBe('BLOCKED');
    expect(componentTotal(obl, 'EQUITY_NORMAL')).toBeNull();
    expect(componentTotal(obl, 'EQUITY_DAY_TRADE')).toBeNull();

    const data = await summary(token, COMP);
    expect(data.eligibility.status).toBe('BLOCKED');
    expect(data.aggregation).toBeNull();
  });

  // --- L: FII + equity isolation with aggregated payment ---
  it('L. FII and equity stay isolated while the payment total aggregates', async () => {
    const userId = 'cb000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, stock, fii } = await setup(userId);
    await trade(token, portfolioId, accountId, fii, 'BUY', '2026-09-01', '10', '100', 'f1');
    await trade(token, portfolioId, accountId, fii, 'SELL', '2026-09-10', '20', '100', 'f2');
    await trade(token, portfolioId, accountId, stock, 'BUY', '2026-08-05', '100', '250', 'b1');
    await trade(token, portfolioId, accountId, stock, 'SELL', '2026-09-20', '104', '250', 's1');
    await withholding(token, {
      competence: COMP,
      economicDate: '2026-09-10',
      category: 'FII',
      amount: '0.1',
      sourceReference: 'fii-1',
    }).expect(200);
    // Normal equity IRRF 20 → normal net 130 (isolated pool).
    await withholding(token, {
      competence: COMP,
      economicDate: '2026-09-20',
      category: 'BRAZILIAN_EQUITY',
      withholdingCategory: 'EQUITY_NORMAL',
      amount: '20',
      sourceReference: 'eq-1',
    }).expect(200);

    const obl = await obligation(token, COMP);
    expect(componentTotal(obl, 'FII')).toBe('199.9');
    expect(componentTotal(obl, 'EQUITY_NORMAL')).toBe('130');
    expect(obl.composition.total).toEqual({ amount: '329.9', currency: 'BRL' });
  });

  // --- M: deadline from the 4C registry ---
  it('M. deadline comes from the official 4C registry', async () => {
    const userId = 'cc000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, stock } = await setup(userId);
    await trade(token, portfolioId, accountId, stock, 'BUY', '2026-09-10', '100', '100', 'b1');
    await trade(token, portfolioId, accountId, stock, 'SELL', '2026-09-10', '110', '100', 's1');

    const obl = await obligation(token, COMP);
    expect(obl.dueDate).toBe('2026-10-30');
    expect(obl.deadline.dueDate).toBe('2026-10-30');
    expect(obl.deadline.sourceAuthority).toBe('RFB');
  });

  // --- N: overdue (4D status) ---
  it('N. a past-deadline composed obligation is OVERDUE status only', async () => {
    const userId = 'cd000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, fii } = await setup(userId);
    await trade(token, portfolioId, accountId, fii, 'BUY', '2026-08-01', '10', '100', 'b1');
    await trade(token, portfolioId, accountId, fii, 'SELL', '2026-08-10', '20', '100', 's1');
    await withholding(token, {
      competence: '2026-08',
      economicDate: '2026-08-10',
      category: 'FII',
      amount: '0.1',
      sourceReference: 'fii-1',
    }).expect(200);

    const obl = await obligation(token, '2026-08');
    expect(obl.composition.total).toEqual({ amount: '199.9', currency: 'BRL' });
    expect(obl.status).toBe('OVERDUE');
    expect(obl.dueDate).toBe('2026-09-30');
  });

  // --- O: DARF readiness via 4F ---
  it('O. a payable composed obligation is DARF-ready through 4F', async () => {
    const userId = 'ce000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, stock } = await setup(userId);
    await trade(token, portfolioId, accountId, stock, 'BUY', '2026-09-10', '100', '100', 'b1');
    await trade(token, portfolioId, accountId, stock, 'SELL', '2026-09-10', '110', '100', 's1');

    const obl = await obligation(token, COMP);
    expect(obl.darfReadiness).toBe('READY');
    const ready = await readiness(token, obl.id);
    expect(ready.status).toBe('USER_ACTION_REQUIRED');
    expect(ready.eligible).toBe(true);
    expect(ready.revenueCode).toBe('6015');
    expect(ready.preparedValues.totalAmount).toEqual({ amount: '200', currency: 'BRL' });
  });

  // --- P: Sicalc interactive handoff via 4F ---
  it('P. Sicalc handoff reuses the existing interactive 4F flow', async () => {
    const userId = 'cf000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, stock } = await setup(userId);
    await trade(token, portfolioId, accountId, stock, 'BUY', '2026-09-10', '100', '100', 'b1');
    await trade(token, portfolioId, accountId, stock, 'SELL', '2026-09-10', '110', '100', 's1');

    const obl = await obligation(token, COMP);
    const result = await handoff(token, obl.id);
    expect(result.readiness.status).toBe('USER_ACTION_REQUIRED');
    expect(result.record.sourceSystem).toBe('RFB_SICALC');
    expect(result.record.generatedByAtlas).toBe(false);
    expect(result.record.officialDocumentId).toBeNull();
    expect(result.readiness.destination.url).toContain('sicalc.receita.fazenda.gov.br');
  });

  // --- Q: no payable ---
  it('Q. a zero month yields no payable obligation', async () => {
    const userId = 'd0000000-0000-4000-8000-000000000000';
    const { token } = await setup(userId);
    const obl = await obligation(token, COMP);
    expect(obl.baseStatus).toBe('NO_PAYMENT_DUE');
    expect(obl.principalAmount).toBeNull();
    expect(obl.composition.status).toBe('NO_ACTIVITY');
    expect(obl.composition.total).toBeNull();
  });

  // --- R: revision / replay determinism ---
  it('R. an upstream election revision deterministically changes the 6015 amount', async () => {
    const userId = 'd1000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, stock } = await setup(userId);
    // 2026-08 exempt loss 2000.
    await trade(token, portfolioId, accountId, stock, 'BUY', '2026-08-05', '200', '100', 'b1');
    await trade(token, portfolioId, accountId, stock, 'SELL', '2026-08-20', '180', '100', 's1');
    // 2026-09 taxable gain 3000.
    await trade(token, portfolioId, accountId, stock, 'BUY', '2026-09-05', '270', '100', 'b2');
    await trade(token, portfolioId, accountId, stock, 'SELL', '2026-09-20', '300', '100', 's2');

    const before = await obligation(token, COMP);
    expect(before.composition.total).toEqual({ amount: '450', currency: 'BRL' });

    await request(app.getHttpServer())
      .put(`/api/v1/fiscal/monthly/2026-08/elections/equity-exempt-loss`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'DECLARE_FOR_CARRYFORWARD' })
      .expect(200);

    const declared = await obligation(token, COMP);
    expect(declared.composition.total).toEqual({ amount: '150', currency: 'BRL' });
    expect(declared.id).not.toBe(before.id);

    await request(app.getHttpServer())
      .put(`/api/v1/fiscal/monthly/2026-08/elections/equity-exempt-loss`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'DO_NOT_DECLARE' })
      .expect(200);

    const declined = await obligation(token, COMP);
    expect(declined.composition.total).toEqual({ amount: '450', currency: 'BRL' });
  });

  // --- S: duplicate replay idempotency ---
  it('S. replaying the same source results never duplicates the obligation', async () => {
    const userId = 'd2000000-0000-4000-8000-000000000000';
    const { token, portfolioId, accountId, stock } = await setup(userId);
    await trade(token, portfolioId, accountId, stock, 'BUY', '2026-09-10', '100', '100', 'b1');
    await trade(token, portfolioId, accountId, stock, 'SELL', '2026-09-10', '110', '100', 's1');

    const first = await obligation(token, COMP);
    const second = await obligation(token, COMP);
    expect(second.id).toBe(first.id);
    expect(second.composition.fingerprint).toBe(first.composition.fingerprint);
    expect(second.composition.total).toEqual(first.composition.total);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/obligations?competence=${COMP}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  // --- T: cross-user isolation ---
  it('T. composed components never leak across tax subjects', async () => {
    const ownerId = 'd3000000-0000-4000-8000-000000000000';
    const owner = await setup(ownerId);
    await trade(
      owner.token,
      owner.portfolioId,
      owner.accountId,
      owner.stock,
      'BUY',
      '2026-09-10',
      '100',
      '100',
      'b1',
    );
    await trade(
      owner.token,
      owner.portfolioId,
      owner.accountId,
      owner.stock,
      'SELL',
      '2026-09-10',
      '110',
      '100',
      's1',
    );
    const ownerObl = await obligation(owner.token, COMP);
    expect(ownerObl.composition.total).toEqual({ amount: '200', currency: 'BRL' });

    const otherId = 'd4000000-0000-4000-8000-000000000000';
    const otherToken = await session(otherId);
    const otherObl = await obligation(otherToken, COMP);
    expect(otherObl.baseStatus).toBe('NO_PAYMENT_DUE');
    expect(otherObl.composition.total).toBeNull();

    const otherList = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/obligations?competence=${COMP}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    // Subject B's list only ever contains B's own (zero) obligation — never A's.
    expect(
      (otherList.body.data as Array<{ principalAmount: unknown }>).every(
        (o) => o.principalAmount === null,
      ),
    ).toBe(true);
  });
});
