import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  seedBaseFixtures,
} from './setup';

describe('API Integration: Institutions, Accounts & Assets', () => {
  let app: INestApplication;
  let portfolioId: string;
  let institutionId: string;

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
    institutionId = fixtures.institutionId;
  });

  describe('Institutions', () => {
    it('should create and retrieve a financial institution', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/institutions')
        .send({
          name: 'BTG Pactual',
          type: 'BANK',
          country: 'BR',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.name).toBe('BTG Pactual');
      expect(createRes.body.data.type).toBe('BANK');

      const getRes = await request(app.getHttpServer()).get(
        `/api/v1/institutions/${createRes.body.data.id}`,
      );
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.name).toBe('BTG Pactual');

      const listRes = await request(app.getHttpServer()).get('/api/v1/institutions');
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Accounts', () => {
    it('should create and retrieve an account linked to a portfolio', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/accounts`)
        .send({
          institutionId,
          name: 'Conta Corretora XP',
          currency: 'BRL',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.name).toBe('Conta Corretora XP');
      expect(createRes.body.data.portfolioId).toBe(portfolioId);
      expect(createRes.body.data.institutionId).toBe(institutionId);

      const accountId = createRes.body.data.id;
      const getRes = await request(app.getHttpServer()).get(
        `/api/v1/accounts/${accountId}`,
      );
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.name).toBe('Conta Corretora XP');

      const listRes = await request(app.getHttpServer()).get(
        `/api/v1/portfolios/${portfolioId}/accounts`,
      );
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should return 404 when creating account for non-existent portfolio or institution', async () => {
      const nonExistent = '99999999-9999-4999-8999-999999999999';

      const badPortfolioRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${nonExistent}/accounts`)
        .send({
          institutionId,
          name: 'Conta Inválida',
          currency: 'BRL',
        });
      expect(badPortfolioRes.status).toBe(404);

      const badInstRes = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolioId}/accounts`)
        .send({
          institutionId: nonExistent,
          name: 'Conta Inválida',
          currency: 'BRL',
        });
      expect(badInstRes.status).toBe(404);
    });
  });

  describe('Assets', () => {
    it('should create and search assets by query, exchange, and type', async () => {
      const petr4Res = await request(app.getHttpServer())
        .post('/api/v1/assets')
        .send({
          ticker: 'PETR4',
          name: 'Petrobras PN',
          type: 'STOCK',
          currency: 'BRL',
          exchange: 'BVMF',
          isin: 'BRPETRACNPR6',
        });
      expect(petr4Res.status).toBe(201);
      expect(petr4Res.body.data.ticker).toBe('PETR4');

      const knri11Res = await request(app.getHttpServer())
        .post('/api/v1/assets')
        .send({
          ticker: 'KNRI11',
          name: 'Kinea Renda Imobiliária',
          type: 'FII',
          currency: 'BRL',
          exchange: 'BVMF',
        });
      expect(knri11Res.status).toBe(201);

      const aaplRes = await request(app.getHttpServer())
        .post('/api/v1/assets')
        .send({
          ticker: 'AAPL',
          name: 'Apple Inc.',
          type: 'STOCK',
          currency: 'USD',
          exchange: 'NASDAQ',
        });
      expect(aaplRes.status).toBe(201);

      // Search by q
      const searchQ = await request(app.getHttpServer())
        .get('/api/v1/assets')
        .query({ q: 'petr' });
      expect(searchQ.status).toBe(200);
      expect(searchQ.body.data.length).toBe(1);
      expect(searchQ.body.data[0].ticker).toBe('PETR4');

      // Search by exchange
      const searchExchange = await request(app.getHttpServer())
        .get('/api/v1/assets')
        .query({ exchange: 'NASDAQ' });
      expect(searchExchange.status).toBe(200);
      expect(searchExchange.body.data.length).toBe(1);
      expect(searchExchange.body.data[0].ticker).toBe('AAPL');

      // Search by type
      const searchType = await request(app.getHttpServer())
        .get('/api/v1/assets')
        .query({ type: 'FII' });
      expect(searchType.status).toBe(200);
      expect(searchType.body.data.length).toBe(1);
      expect(searchType.body.data[0].ticker).toBe('KNRI11');
    });
  });
});
