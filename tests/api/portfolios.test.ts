import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  cleanDatabase,
  getTestPrismaClient,
} from './setup';

describe('API Integration: Portfolios Resource', () => {
  let app: INestApplication;
  const prisma = getTestPrismaClient();

  const userId = '11111111-1111-4111-8111-111111111111';

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await prisma.user.create({
      data: {
        id: userId,
        email: 'portfolio-tester@atlas.dev',
        name: 'Portfolio Tester',
      },
    });
  });

  it('POST /api/v1/portfolios should create a new portfolio', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .send({
        userId,
        name: 'Minha Carteira Principal',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.name).toBe('Minha Carteira Principal');
    expect(res.body.data.baseCurrency).toBe('BRL');
    expect(res.body.data.type).toBe('PERSONAL');
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('POST /api/v1/portfolios should persist and round-trip SIMULATION portfolio', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .send({
        userId,
        name: 'Carteira Simulada 2026',
        baseCurrency: 'USD',
        type: 'SIMULATION',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('SIMULATION');
    expect(res.body.data.baseCurrency).toBe('USD');

    // Retrieve by ID
    const getRes = await request(app.getHttpServer()).get(
      `/api/v1/portfolios/${res.body.data.id}`,
    );

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.type).toBe('SIMULATION');
    expect(getRes.body.data.name).toBe('Carteira Simulada 2026');
  });

  it('POST /api/v1/portfolios should reject invalid payloads with 400 and validation error details', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/portfolios')
      .send({
        userId: 'not-a-uuid',
        name: '',
        baseCurrency: 'INVALID_CURRENCY',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(res.body.code).toBe('VALIDATION.INVALID_INPUT');
    expect(res.body.details).toBeDefined();
    expect(res.body.requestId).toBeDefined();
  });

  it('GET /api/v1/portfolios/:portfolioId should return 400 for invalid UUID format', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/portfolios/not-valid-uuid',
    );

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION.INVALID_INPUT');
  });

  it('GET /api/v1/portfolios/:portfolioId should return 404 when portfolio does not exist', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/portfolios/99999999-9999-4999-8999-999999999999',
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
    expect(res.body.message).toContain('Portfolio with id');
  });

  it('GET /api/v1/portfolios?userId=... should list user portfolios', async () => {
    // Create two portfolios
    await request(app.getHttpServer()).post('/api/v1/portfolios').send({
      userId,
      name: 'Carteira A',
      baseCurrency: 'BRL',
    });
    await request(app.getHttpServer()).post('/api/v1/portfolios').send({
      userId,
      name: 'Carteira B',
      baseCurrency: 'USD',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/portfolios')
      .query({ userId });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.map((p: { name: string }) => p.name)).toContain('Carteira A');
    expect(res.body.data.map((p: { name: string }) => p.name)).toContain('Carteira B');
  });
});
