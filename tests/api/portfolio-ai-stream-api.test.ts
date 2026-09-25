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
import {
  FakeAiProvider,
  parseSseStream,
  GroundedAiStreamStartedData,
  GroundedAiStreamProgressData,
  GroundedAiStreamFinalData,
  GroundedAiStreamErrorData,
  AiProvider,
} from '@atlas/ai-engine';

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

describe('API Integration: Portfolio AI Streaming (Phase 3U)', () => {
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
          name: 'Stream Tester',
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
        name: 'Grounded AI Stream Portfolio',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });

    const institution = await prisma.institution.create({
      data: { name: 'Test Broker Stream', type: 'BROKER', country: 'BR' },
    });

    const account = await prisma.account.create({
      data: {
        portfolioId: portfolio.id,
        institutionId: institution.id,
        name: 'Custody Account Stream',
        currency: 'BRL',
        status: 'ACTIVE',
      },
    });

    const asset = await prisma.asset.upsert({
      where: {
        ticker_exchange: {
          ticker: 'PETR4',
          exchange: 'BVMF',
        },
      },
      create: {
        ticker: 'PETR4',
        name: 'Petrobras PN',
        type: 'STOCK',
        currency: 'BRL',
        exchange: 'BVMF',
      },
      update: {},
    });

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

    return { portfolio, account, asset };
  }

  describe('Security & Isolation (ADR-199 & Section 7)', () => {
    it('rejects unauthenticated stream requests with 401', async () => {
      const dummyId = '00000000-0000-4000-8000-000000000001';
      const res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${dummyId}/ai/conversations/${dummyId}/messages/stream`)
        .send({ question: 'Como foi o desempenho?' });

      expect(res.status).toBe(401);
    });

    it('returns hidden 404 when streaming for portfolio owned by another user', async () => {
      const userA = '11111111-1111-4111-8111-111111111111';
      const userB = '22222222-2222-4222-8222-222222222222';
      const { portfolio } = await seedPortfolioWithLedger(userA);

      const conv = await prisma.aiConversation.create({
        data: {
          portfolioId: portfolio.id,
          userId: userA,
          title: 'Private Conversation',
        },
      });

      await ensureUser(userB);
      const intruderSession = await createAuthenticatedUserSession(userB);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${conv.id}/messages/stream`)
        .set('Authorization', `Bearer ${intruderSession.token}`)
        .send({ question: 'Como foi o desempenho?' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CONVERSATION.NOT_FOUND');
    });

    it('returns hidden 404 when conversation belongs to another portfolio', async () => {
      const userId = '33333333-3333-4333-8333-333333333333';
      const { portfolio: p1 } = await seedPortfolioWithLedger(userId);

      const p2 = await prisma.portfolio.create({
        data: {
          userId,
          name: 'Second Portfolio Stream',
          baseCurrency: 'BRL',
          type: 'PERSONAL',
          status: 'ACTIVE',
        },
      });

      const convP1 = await prisma.aiConversation.create({
        data: {
          portfolioId: p1.id,
          userId,
          title: 'Conv in P1',
        },
      });

      const session = await createAuthenticatedUserSession(userId);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${p2.id}/ai/conversations/${convP1.id}/messages/stream`)
        .set('Authorization', `Bearer ${session.token}`)
        .send({ question: 'Como foi o desempenho?' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CONVERSATION.NOT_FOUND');
    });
  });

  describe('Supported Intent Streaming & Parity (Phase 3U)', () => {
    it('streams SSE progress events, delivers terminal FINAL, and persists turn', async () => {
      const userId = '44444444-4444-4444-8444-444444444444';
      const { portfolio } = await seedPortfolioWithLedger(userId);
      const session = await createAuthenticatedUserSession(userId);

      const conv = await prisma.aiConversation.create({
        data: {
          portfolioId: portfolio.id,
          userId,
          title: 'Performance Stream',
        },
      });

      // Configure fake provider with successful claim structure
      const fakeProvider = new FakeAiProvider({
        scenario: 'CLAIM_SUCCESS',
        customClaimFactIds: ['BRL.PERFORMANCE.TWR'],
      });
      const currentProvider = app.get(AI_PROVIDER_TOKEN);
      if (currentProvider && typeof currentProvider === 'object') {
        Object.assign(currentProvider, fakeProvider);
      }

      const res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${conv.id}/messages/stream`)
        .set('Authorization', `Bearer ${session.token}`)
        .send({ question: 'Como foi o desempenho da minha carteira no período?' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.headers['cache-control']).toContain('no-cache');

      const events = parseSseStream(res.text);
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events.length).toBeLessThanOrEqual(8);

      // Verify sequence strictly 1..N
      const sequences = events.map((e) => e.sequence);
      for (let i = 0; i < sequences.length; i++) {
        expect(sequences[i]).toBe(i + 1);
      }

      // First event must be STARTED
      expect(events[0]!.type).toBe('STARTED');
      expect((events[0]!.data as GroundedAiStreamStartedData).conversationId).toBe(conv.id);

      // Intermediary events must be PROGRESS without financial values
      const progressEvents = events.filter((e) => e.type === 'PROGRESS');
      for (const pe of progressEvents) {
        const data = pe.data as GroundedAiStreamProgressData;
        expect(data.stage).toBeDefined();
        expect(data.message).toBeDefined();
        // Invariant ADR-200: zero numbers or currencies in progress events
        expect(data.message).not.toMatch(/\d/);
        expect(data.message).not.toMatch(/R\$|BRL|USD|%/);
      }

      // Last event must be FINAL
      const lastEvent = events[events.length - 1]!;
      expect(lastEvent.type).toBe('FINAL');
      const finalData = lastEvent.data as GroundedAiStreamFinalData;
      expect(finalData.status).toBe('ANSWERED');
      expect(finalData.intent).toBe('EXPLAIN_PERFORMANCE');
      expect(finalData.answer).toBeDefined();
      expect(finalData.evidence.length).toBeGreaterThan(0);

      // Check DB persistence via GET endpoint
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${conv.id}`)
        .set('Authorization', `Bearer ${session.token}`);

      expect(getRes.status).toBe(200);
      const messages = getRes.body.data.messages;
      expect(messages.length).toBe(2); // 1 user + 1 assistant
      const assistantMsg = messages.find((m: { role: string }) => m.role === 'ASSISTANT');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg.content).toBe(finalData.answer);
      expect(assistantMsg.status).toBe('ANSWERED');
    });
  });

  describe('Unsupported Intent Refusal (ADR-200)', () => {
    it('streams refusal with 0 grounding facts and 0 provider calls for unsupported queries', async () => {
      const userId = '55555555-5555-4555-8555-555555555555';
      const { portfolio } = await seedPortfolioWithLedger(userId);
      const session = await createAuthenticatedUserSession(userId);

      const conv = await prisma.aiConversation.create({
        data: {
          portfolioId: portfolio.id,
          userId,
          title: 'Refusal Test',
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${conv.id}/messages/stream`)
        .set('Authorization', `Bearer ${session.token}`)
        .send({ question: 'Devo comprar PETR4 hoje?' });

      expect(res.status).toBe(200);
      const events = parseSseStream(res.text);

      expect(events[0]!.type).toBe('STARTED');
      const lastEvent = events[events.length - 1]!;
      expect(lastEvent.type).toBe('FINAL');

      const finalData = lastEvent.data as GroundedAiStreamFinalData;
      expect(finalData.status).toBe('UNSUPPORTED');
      expect(finalData.intent).toBe('UNSUPPORTED_RECOMMENDATION');
      expect(finalData.answer).toContain('não recomenda compras, vendas ou rebalanceamentos');
      expect(finalData.evidence).toEqual([]);
      expect(finalData.claims).toEqual([]);
    });
  });

  describe('Provider Failure Handling', () => {
    it('streams ERROR event and persists zero assistant turns on provider failure', async () => {
      const userId = '66666666-6666-4666-8666-666666666666';
      const { portfolio } = await seedPortfolioWithLedger(userId);
      const session = await createAuthenticatedUserSession(userId);

      const conv = await prisma.aiConversation.create({
        data: {
          portfolioId: portfolio.id,
          userId,
          title: 'Error Test',
        },
      });

      // Provider throws error
      const currentProvider = app.get<AiProvider>(AI_PROVIDER_TOKEN);
      if (currentProvider && typeof currentProvider === 'object') {
        currentProvider.complete = async () => {
          throw new Error('OpenAI timeout after 10000ms');
        };
      }

      const res = await request(app.getHttpServer())
        .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${conv.id}/messages/stream`)
        .set('Authorization', `Bearer ${session.token}`)
        .send({ question: 'Como foi o desempenho?' });

      expect(res.status).toBe(200);
      const events = parseSseStream(res.text);

      const errorEvent = events.find((e) => e.type === 'ERROR');
      expect(errorEvent).toBeDefined();
      expect((errorEvent!.data as GroundedAiStreamErrorData).code).toBe('AI.PROVIDER_UNAVAILABLE');

      // Verify ZERO assistant messages were saved to the DB
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${conv.id}`)
        .set('Authorization', `Bearer ${session.token}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.messages).toHaveLength(0);
    });
  });
});
