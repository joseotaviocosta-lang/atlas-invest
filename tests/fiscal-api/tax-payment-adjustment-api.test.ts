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

describe('API Integration: overdue tax adjustment (Phase 4D.2)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRISMA_CLIENT)
      .useValue(prisma)
      .overrideProvider(FISCAL_CLOCK)
      .useValue({ today: () => '2026-10-05' })
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
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

  async function fiiChain(userId: string, sellUnitPrice = '20') {
    const token = await session(userId);
    const portfolioRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P', baseCurrency: 'BRL', type: 'PERSONAL' })
      .expect(201);
    const portfolioId = portfolioRes.body.data.id;
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
    const accountId = accountRes.body.data.id;
    const asset = Asset.create({
      ticker: 'MXRF11',
      name: 'FII',
      type: 'FII',
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
    const tx = (
      type: string,
      quantity: string,
      unitPrice: string,
      tradeDate: string,
      externalId: string,
    ) =>
      request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          accountId,
          assetId: asset.id,
          type,
          quantity,
          unitPrice,
          currency: 'BRL',
          tradeDate,
          provider: 'B3',
          externalId,
        })
        .expect(201);
    await tx('BUY', '100', '10', '2026-07-01', 'b1');
    await tx('SELL', '100', sellUnitPrice, '2026-08-10', 's1');
    await request(app.getHttpServer())
      .post('/api/v1/fiscal/inputs/withholdings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        competence: '2026-08',
        economicDate: '2026-08-10',
        category: 'FII',
        amount: '0.1',
        currency: 'BRL',
        status: 'CONFIRMED',
        sourceType: 'MANUAL',
        sourceReference: 'irrf',
      })
      .expect(200);
    const obligation = await request(app.getHttpServer())
      .get('/api/v1/fiscal/monthly/2026-08/obligation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return {
      token,
      obligationId: obligation.body.data.id as string,
      obligation: obligation.body.data,
    };
  }

  it('reproduces the verified overdue amount (199.90 + 0.66 + 2.00 = 202.56)', async () => {
    const { token, obligationId, obligation } = await fiiChain(
      'bb111111-1111-4111-8111-111111111111',
    );
    expect(obligation.status).toBe('OVERDUE');
    expect(obligation.principalAmount.amount).toBe('199.9');

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/obligations/${obligationId}/adjustment?paymentDate=2026-10-01`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const data = res.body.data;
    expect(data.status).toBe('READY');
    expect(data.lateFeeAmount).toEqual({ amount: '0.66', currency: 'BRL' });
    expect(data.interestAmount).toEqual({ amount: '2.00', currency: 'BRL' });
    expect(data.updatedAmount).toEqual({ amount: '202.56', currency: 'BRL' });
    expect(data.authority.source).toBe('SICALC');
  });

  it('is NOT_LATE on the due date', async () => {
    const { token, obligationId } = await fiiChain('bb222222-2222-4222-8222-222222222222');
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/obligations/${obligationId}/adjustment?paymentDate=2026-09-30`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('NOT_LATE');
    expect(res.body.data.updatedAmount).toEqual({ amount: '199.90', currency: 'BRL' });
  });

  it('fails closed without an official late-fee snapshot', async () => {
    // A different principal (399.90) has no official snapshot → BLOCKED.
    const { token, obligationId } = await fiiChain('bb333333-3333-4333-8333-333333333333', '30');
    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/obligations/${obligationId}/adjustment?paymentDate=2026-10-01`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.status).toBe('BLOCKED');
    expect(res.body.data.reasonCode).toBe('MISSING_LATE_FEE_AUTHORITY');
  });

  it('rejects an insufficient overdue payment (principal only) and accepts the exact updated amount', async () => {
    const { token, obligationId } = await fiiChain('bb444444-4444-4444-8444-444444444444');

    await request(app.getHttpServer())
      .post(`/api/v1/fiscal/obligations/${obligationId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paidAt: '2026-10-01',
        amount: '199.9',
        currency: 'BRL',
        sourceType: 'MANUAL_CONFIRMED',
      })
      .expect(400);

    const paid = await request(app.getHttpServer())
      .post(`/api/v1/fiscal/obligations/${obligationId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paidAt: '2026-10-01',
        amount: '202.56',
        currency: 'BRL',
        sourceType: 'MANUAL_CONFIRMED',
      })
      .expect(200);
    expect(paid.body.data.status).toBe('PAID');
  });

  it('enforces authorization (404) and validates paymentDate', async () => {
    const { token, obligationId } = await fiiChain('bb555555-5555-4555-8555-555555555555');
    const intruder = await session('bb666666-6666-4666-8666-666666666666');
    await request(app.getHttpServer())
      .get(`/api/v1/fiscal/obligations/${obligationId}/adjustment?paymentDate=2026-10-01`)
      .set('Authorization', `Bearer ${intruder}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/fiscal/obligations/${obligationId}/adjustment?paymentDate=2026-13-40`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('H9: provisional obligation without due date blocks adjustment (OBLIGATION_NOT_PAYABLE)', async () => {
    // Owner H9 state: PROVISIONAL R$15 competence row with null dueDate.
    // Adjustment preview must fail closed without inventing multa/juros.
    const userId = 'bb900000-0000-4000-9000-000000000000';
    const token = await session(userId);
    const created = await prisma.taxObligationRecord.create({
      data: {
        id: 'b0900000-0000-4000-a000-000000000001',
        taxSubjectId: userId,
        competence: '2026-10',
        taxBucket: 'FII_SALE',
        revenueCode: '6015',
        liabilityFingerprint: 'fp-h9-provisional-v1',
        revision: 1,
        principalAmount: '15',
        currency: 'BRL',
        dueDate: null,
        status: 'PROVISIONAL',
        reasonCode: 'IN_PROGRESS_COMPETENCE',
        darfReadiness: 'PARTIAL',
        dataQuality: 'COMPLETE',
        provenance: {},
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/fiscal/obligations/${created.id}/adjustment?paymentDate=2026-10-15`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.status).toBe('BLOCKED');
    expect(res.body.data.reasonCode).toBe('OBLIGATION_NOT_PAYABLE');
    expect(res.body.data.updatedAmount).toBeNull();
    expect(res.body.data.lateFeeAmount).toBeNull();
    expect(res.body.data.interestAmount).toBeNull();
  });
});
