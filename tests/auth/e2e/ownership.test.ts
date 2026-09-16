import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createAuthTestApp, closeAuthTestApp, cleanDatabase, registerAndLoginUser } from '../setup';

describe('Auth E2E: Resource Ownership & Cross-User Isolation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const res = await createAuthTestApp();
    app = res.app;
  });

  afterAll(async () => {
    await closeAuthTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('should enforce strict ownership and return 404 for cross-user resource access', async () => {
    // 1. Create User A and User B
    const userA = await registerAndLoginUser(
      app,
      'usera@atlas.dev',
      'UserAPassword123!',
      'User Alpha',
    );
    const userB = await registerAndLoginUser(
      app,
      'userb@atlas.dev',
      'UserBPassword123!',
      'User Beta',
    );

    // 2. Client Spoofing test: User B passes userId of User A in POST /api/v1/portfolios
    const spoofRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({
        name: 'Spoofed Portfolio',
        baseCurrency: 'BRL',
        userId: userA.user.id, // Trying to spoof user A
      });

    // In strict schema mode, unrecognized keys are rejected with 400 Bad Request
    expect(spoofRes.status).toBe(400);

    // 3. User B creates a legitimate portfolio
    const createPortRes = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({
        name: 'Portfolio Beta',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
      });

    expect(createPortRes.status).toBe(201);
    const portfolioBId = createPortRes.body.data.id;
    expect(portfolioBId).toBeDefined();

    // 4. Isolation test: User A calls GET /api/v1/portfolios/:portfolioBId -> MUST RETURN 404 Not Found
    const crossGetPortRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioBId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`);

    expect(crossGetPortRes.status).toBe(404);
    expect(crossGetPortRes.body.code).toBe('PERSISTENCE.ENTITY_NOT_FOUND');

    // 5. List isolation test: User A calls GET /api/v1/portfolios -> does NOT contain Portfolio B
    const listPortResA = await request(app.getHttpServer())
      .get('/api/v1/portfolios')
      .set('Authorization', `Bearer ${userA.accessToken}`);

    expect(listPortResA.status).toBe(200);
    expect(listPortResA.body.data.length).toBe(0);

    // 6. Setup institution, asset and account under Portfolio B
    const instRes = await request(app.getHttpServer())
      .post('/api/v1/institutions')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({
        name: 'BTG Pactual',
        type: 'BANK',
        country: 'BR',
      });
    expect(instRes.status).toBe(201);
    const instId = instRes.body.data.id;

    const createAccountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioBId}/accounts`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({
        institutionId: instId,
        name: 'Conta Corretora Beta',
        currency: 'BRL',
      });
    expect(createAccountRes.status).toBe(201);
    const accountBId = createAccountRes.body.data.id;

    // 7. Account Ownership: User A attempts to access accounts in Portfolio B
    // User A calls GET /portfolios/:portfolioBId/accounts -> 404
    const crossListAccountsRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioBId}/accounts`)
      .set('Authorization', `Bearer ${userA.accessToken}`);
    expect(crossListAccountsRes.status).toBe(404);

    // User A calls GET /accounts/:accountBId -> 404
    const crossGetAccountRes = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountBId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`);
    expect(crossGetAccountRes.status).toBe(404);

    // User A calls POST /portfolios/:portfolioBId/accounts -> 404
    const crossCreateAccountRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioBId}/accounts`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        institutionId: instId,
        name: 'Injected Account',
        currency: 'BRL',
      });
    expect(crossCreateAccountRes.status).toBe(404);

    // 8. Transaction Ownership: User B records a transaction in Portfolio B
    const createTxRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioBId}/transactions`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({
        accountId: accountBId,
        type: 'DEPOSIT',
        currency: 'BRL',
        tradeDate: '2026-03-01',
        amount: '10000.00',
      });
    expect(createTxRes.status).toBe(201);
    const txBId = createTxRes.body.data.id;

    // User A attempts to append transaction to Portfolio B -> 404
    const crossCreateTxRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioBId}/transactions`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({
        accountId: accountBId,
        type: 'DEPOSIT',
        currency: 'BRL',
        tradeDate: '2026-03-02',
        amount: '500.00',
      });
    expect(crossCreateTxRes.status).toBe(404);

    // User A attempts to list transactions from Portfolio B -> 404
    const crossListTxRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioBId}/transactions`)
      .set('Authorization', `Bearer ${userA.accessToken}`);
    expect(crossListTxRes.status).toBe(404);

    // User A attempts to get specific transaction txBId -> 404
    const crossGetTxRes = await request(app.getHttpServer())
      .get(`/api/v1/transactions/${txBId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`);
    expect(crossGetTxRes.status).toBe(404);
  });
});
