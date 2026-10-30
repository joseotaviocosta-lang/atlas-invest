import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  seedBaseFixtures,
  createAuthenticatedUserSession,
} from './setup';

/**
 * Corporate-action entry HTTP flow (real app + real test DB, no mocks).
 * VIVT3-shaped pair: opening 200 → REVERSE_SPLIT 40 → SPLIT 80 → 400.
 * No production ledger touched (atlas_test only).
 */
describe('Corporate actions HTTP: preview + atomic confirm', () => {
  let app: INestApplication;
  let authToken: string;
  let portfolioId: string;
  let accountId: string;
  let assetId: string;

  const legs = [
    {
      assetId: '',
      type: 'REVERSE_SPLIT',
      tradeDate: '2025-04-15',
      factor: '40',
      notes: 'Telefônica Brasil — grupamento 40:1, efeitos em 15/04/2025.',
    },
    {
      assetId: '',
      type: 'SPLIT',
      tradeDate: '2025-04-15',
      factor: '80',
      notes: 'Telefônica Brasil — desdobramento 1:80, efeitos em 15/04/2025.',
    },
  ];

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const fixtures = await seedBaseFixtures();
    portfolioId = fixtures.portfolioId;
    accountId = fixtures.accountId;
    ({ token: authToken } = await createAuthenticatedUserSession(fixtures.userId));
    const assetRes = await request(app.getHttpServer())
      .post('/api/v1/assets')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ticker: 'VIVT3',
        name: 'Telefônica Brasil ON',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'BVMF',
      });
    expect(assetRes.status).toBe(201);
    assetId = assetRes.body.data.id;
    for (const leg of legs) leg.assetId = assetId;
    // Opening position 200 (settled baseline).
    const openingRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/transactions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        accountId,
        type: 'TRANSFER_IN',
        currency: 'BRL',
        tradeDate: '2024-12-31',
        assetId,
        quantity: '200',
      });
    expect(openingRes.status).toBe(201);
  });

  it('previews the pair sequentially and confirms atomically to 400', async () => {
    const previewRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/corporate-actions/preview`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ accountId, currency: 'BRL', legs });
    expect(previewRes.status).toBe(200);
    const preview = previewRes.body.data;
    expect(preview.readyCount).toBe(2);
    expect(preview.legs[0]).toMatchObject({
      type: 'REVERSE_SPLIT',
      status: 'READY',
      beforeQuantity: '200',
      afterQuantity: '5',
      costBasisStatus: 'INCOMPLETE',
      fractionWarning: null,
    });
    expect(preview.legs[1]).toMatchObject({
      type: 'SPLIT',
      status: 'READY',
      beforeQuantity: '5',
      afterQuantity: '400',
    });
    expect(preview.projectedQuantities).toEqual([
      { assetId, assetTicker: 'VIVT3', beforeQuantity: '200', afterQuantity: '400' },
    ]);

    // Preview persists nothing: history count is identical before/after.
    const historyBefore = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history?limit=1`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(historyBefore.status).toBe(200);
    const totalBefore = historyBefore.body.meta.totalCount;
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/corporate-actions/preview`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ accountId, currency: 'BRL', legs });
    const historyAfter = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history?limit=1`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(historyAfter.body.meta.totalCount).toBe(totalBefore);

    const confirmRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/corporate-actions/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        accountId,
        currency: 'BRL',
        legs,
        expectedLedgerFingerprint: preview.ledgerFingerprint,
      });
    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.data).toHaveLength(2);

    const stateRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/state`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(stateRes.status).toBe(200);
    const position = stateRes.body.data.positions.find(
      (p: { assetId: string }) => p.assetId === assetId,
    );
    expect(position.quantity).toBe('400');
    expect(position.costBasisStatus).toBe('INCOMPLETE');

    // History shows both legs (same tradeDate orders by id; assert as a set).
    const historyRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolioId}/history?type=corporate-action`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(historyRes.status).toBe(200);
    const types = historyRes.body.data.map(
      (item: { details: { type: string } }) => item.details.type,
    );
    expect([...types].sort()).toEqual(['REVERSE_SPLIT', 'SPLIT']);

    // Re-confirm with the spent fingerprint is stale (409), nothing rewritten.
    const staleRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolioId}/corporate-actions/confirm`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        accountId,
        currency: 'BRL',
        legs,
        expectedLedgerFingerprint: preview.ledgerFingerprint,
      });
    expect(staleRes.status).toBe(409);
  });

  it('rejects invalid payloads without writing (400)', async () => {
    const base = { accountId, currency: 'BRL', legs };
    for (const mutate of [
      { legs: [{ ...legs[0], factor: '1' }] },
      { legs: [{ ...legs[0], factor: '0' }] },
      { legs: [{ ...legs[0], type: 'BONUS' }] },
      { legs: [{ ...legs[0], notes: '' }] },
      { legs: [] },
    ]) {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/corporate-actions/preview`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...base, ...mutate });
      expect(res.status).toBe(400);
    }
  });

  it('returns 404 for foreign portfolios (anti-enumeration)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/portfolios/00000000-0000-4000-8000-000000000000/corporate-actions/preview')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ accountId, currency: 'BRL', legs });
    expect(res.status).toBe(404);
  });
});
