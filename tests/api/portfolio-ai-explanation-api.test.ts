import 'reflect-metadata';

process.env.MARKET_DATA_PROVIDER = 'IN_MEMORY';
process.env.HISTORICAL_MARKET_DATA_PROVIDER = 'IN_MEMORY';
process.env.BENCHMARK_DATA_PROVIDER = 'IN_MEMORY';
process.env.RATE_BENCHMARK_DATA_PROVIDER = 'IN_MEMORY';
process.env.AI_PROVIDER = 'FAKE';

import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, createAuthenticatedUserSession } from './setup';
import { getTestPrismaClient, cleanDatabase } from '../database/setup';
import {
  HISTORICAL_MARKET_DATA_PROVIDER,
  BENCHMARK_DATA_PROVIDER,
  RATE_BENCHMARK_DATA_PROVIDER,
} from '../../apps/api/src/market-data/tokens';
import type { InMemoryHistoricalMarketDataProvider } from '@atlas/market-data';
import type {
  InMemoryBenchmarkDataProvider,
  InMemoryRateBenchmarkDataProvider,
} from '@atlas/benchmark-engine';
import { AI_PROVIDER_TOKEN } from '../../apps/api/src/infrastructure/ai/openai-ai.provider';
import { FakeAiProvider } from '@atlas/ai-engine';

function businessDates(n: number, startIso = '2026-01-05'): string[] {
  const out: string[] = [];
  const [y, m, day] = startIso.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1, day!));
  while (out.length < n) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe('API Integration: Portfolio AI Explanation (POST /ai/explain, Phase 3R)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof getTestPrismaClient>;
  let historical: InMemoryHistoricalMarketDataProvider;
  let benchmark: InMemoryBenchmarkDataProvider;
  let rates: InMemoryRateBenchmarkDataProvider;

  const DAYS = businessDates(25);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getTestPrismaClient();
    historical = app.get<InMemoryHistoricalMarketDataProvider>(HISTORICAL_MARKET_DATA_PROVIDER);
    benchmark = app.get<InMemoryBenchmarkDataProvider>(BENCHMARK_DATA_PROVIDER);
    rates = app.get<InMemoryRateBenchmarkDataProvider>(RATE_BENCHMARK_DATA_PROVIDER);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  async function ensureUser(userId: string) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@atlas.dev`,
          name: 'Explanation Tester',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$dummyhashdummyhashdummyhash$dummyhashdummyhashdummyhash',
        },
      });
    }
  }

  async function seedPortfolioWithLedger(userId: string) {
    await ensureUser(userId);

    const portfolio = await prisma.portfolio.create({
      data: {
        userId,
        name: 'Grounded AI Test Portfolio',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });

    const institution = await prisma.institution.create({
      data: { name: 'Test Broker', type: 'BROKER', country: 'BR' },
    });

    const account = await prisma.account.create({
      data: {
        portfolioId: portfolio.id,
        institutionId: institution.id,
        name: 'Custody Account',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });

    const asset = await prisma.asset.create({
      data: {
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'BVMF',
      },
    });

    // Populate historical prices
    for (let i = 0; i < DAYS.length; i++) {
      const dt = DAYS[i]!;
      const price = (30 + i * 0.5).toFixed(2);
      historical.seed({
        ticker: asset.ticker,
        exchange: asset.exchange,
        date: dt,
        close: price,
        currency: asset.currency,
      });
      benchmark.seed({ benchmarkId: 'IBOV', date: dt, value: String(100 + ((i * 3) % 7)) });
      rates.seed({ benchmarkId: 'CDI', date: dt, rate: '0.05' });
    }

    // Buy transaction on day 0
    await prisma.transaction.create({
      data: {
        portfolioId: portfolio.id,
        accountId: account.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date(`${DAYS[0]}T00:00:00.000Z`),
        settlementDate: new Date(`${DAYS[0]}T00:00:00.000Z`),
        quantity: '100',
        unitPrice: '30.00',
        currency: 'BRL',
        source: 'MANUAL',
      },
    });

    return { portfolio, asset, account };
  }

  it('1. Requires authentication (401 Unauthorized)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/portfolios/00000000-0000-4000-8000-000000000001/ai/explain')
      .send({ question: 'Como foi o desempenho da minha carteira?' });

    expect(res.status).toBe(401);
  });

  it('2. Enforces cross-user hidden 404', async () => {
    const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const { portfolio } = await seedPortfolioWithLedger(userA);
    await ensureUser(userB);
    const sessionB = await createAuthenticatedUserSession(userB);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/explain`)
      .set('Authorization', `Bearer ${sessionB.token}`)
      .send({ question: 'Como foi o desempenho da minha carteira?' });

    expect(res.status).toBe(404);
  });

  it('3. Validates question length and payload (400 Bad Request)', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    // Question too short (< 3 chars)
    const resShort = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/explain`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ question: 'Oi' });

    expect(resShort.status).toBe(400);

    // Invalid date format
    const resDate = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/explain`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ question: 'Qual a rentabilidade?', startDate: 'not-a-date' });

    expect(resDate.status).toBe(400);
  });

  it('4. Rejects unsupported recommendation requests before calling model (200 UNSUPPORTED)', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/explain`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ question: 'Qual ação devo comprar para minha carteira?' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNSUPPORTED');
    expect(res.body.data.intent).toBe('UNSUPPORTED_RECOMMENDATION');
    expect(res.body.data.answer).toContain('não recomenda compras, vendas ou rebalanceamentos');
    expect(res.body.data.evidence).toHaveLength(0);
  });

  it('5. Rejects unsupported prediction requests before calling model (200 UNSUPPORTED)', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/explain`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ question: 'Quanto minha carteira vai render no próximo ano?' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNSUPPORTED');
    expect(res.body.data.intent).toBe('UNSUPPORTED_PREDICTION');
    expect(res.body.data.answer).toContain('não realizamos previsões de mercado');
  });

  it('6. Rejects unsupported tax advice requests before calling model (200 UNSUPPORTED)', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/explain`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ question: 'Quanto imposto devo pagar da minha DARF?' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNSUPPORTED');
    expect(res.body.data.intent).toBe('UNSUPPORTED_TAX');
    expect(res.body.data.answer).toContain('não fornece consultoria tributária');
  });

  it('7. Rejects unsupported new calculation requests before calling model (200 UNSUPPORTED)', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/explain`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ question: 'Calcule meu Sharpe dos últimos 17 dias.' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNSUPPORTED');
    expect(res.body.data.intent).toBe('UNSUPPORTED_NEW_CALCULATION');
  });

  it('8. Executes supported explanation successfully with verified evidence citations (200 ANSWERED)', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/explain`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        question: 'Como foi o desempenho da minha carteira no período?',
        startDate: DAYS[0],
        endDate: DAYS[DAYS.length - 1],
      });

    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.schemaVersion).toBe('1');
    expect(data.status).toBe('ANSWERED');
    expect(data.intent).toBe('EXPLAIN_PERFORMANCE');
    expect(data.answer).toBeDefined();
    expect(data.evidence.length).toBeGreaterThan(0);
    expect(data.evidence[0].factId).toBe('BRL.PERFORMANCE.TWR');
    expect(data.evidence[0].value).toBeDefined();
    expect(data.evidence[0].unit).toBe('PERCENTAGE');

    // Confidentiality check: no secrets or internal tokens leaked in response
    const jsonStr = JSON.stringify(data);
    expect(jsonStr).not.toContain('OPENAI_API_KEY');
    expect(jsonStr).not.toContain('Bearer');
    expect(jsonStr).not.toContain('password');
  });

  it('9. Returns 503 when AI provider fails or is unavailable', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const aiProvider = app.get<FakeAiProvider>(AI_PROVIDER_TOKEN);
    const spy = vi
      .spyOn(aiProvider, 'complete')
      .mockRejectedValueOnce(new Error('AI provider connection timeout'));

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/explain`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        question: 'Como foi o desempenho da minha carteira?',
      });

    expect(res.status).toBe(503);
    spy.mockRestore();
  });

  it('10. Returns 422 when model returns malformed non-JSON response', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const aiProvider = app.get<FakeAiProvider>(AI_PROVIDER_TOKEN);
    const spy = vi.spyOn(aiProvider, 'complete').mockResolvedValueOnce({
      role: 'assistant',
      content: 'MALFORMED RAW TEXT {not: json}',
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/explain`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        question: 'Como foi o desempenho da minha carteira?',
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('AI.INVALID_MODEL_RESPONSE');
    spy.mockRestore();
  });

  it('11. Returns 422 when model cites hallucinated or unknown fact IDs', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const aiProvider = app.get<FakeAiProvider>(AI_PROVIDER_TOKEN);
    const spy = vi.spyOn(aiProvider, 'complete').mockResolvedValueOnce({
      role: 'assistant',
      content: JSON.stringify({
        answer: 'Sua carteira rendeu 50%.',
        evidenceFactIds: ['HALLUCINATED.FACT.ID'],
        limitations: [],
      }),
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/explain`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        question: 'Como foi o desempenho da minha carteira?',
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('AI.INVALID_MODEL_RESPONSE');
    expect(res.body.message).toContain('unknown facts');
    spy.mockRestore();
  });

  it('12. Fails closed (422) when model cites 0 evidence facts for portfolio explanation', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const aiProvider = app.get<FakeAiProvider>(AI_PROVIDER_TOKEN);
    const spy = vi.spyOn(aiProvider, 'complete').mockResolvedValueOnce({
      role: 'assistant',
      content: JSON.stringify({
        answer: 'Texto sem citar nenhum fato verificado.',
        evidenceFactIds: [],
        limitations: [],
      }),
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/explain`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        question: 'Como foi o desempenho da minha carteira?',
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('AI.INVALID_MODEL_RESPONSE');
    expect(res.body.message).toContain('lacks verified financial evidence');
    spy.mockRestore();
  });
});
