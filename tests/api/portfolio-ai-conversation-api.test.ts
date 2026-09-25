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

describe('API Integration: Portfolio AI Conversation (Phase 3S)', () => {
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
          name: 'Conversation Tester',
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
        name: 'Grounded AI Conversation Portfolio',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });

    const institution = await prisma.institution.create({
      data: { name: 'Test Broker Conv', type: 'BROKER', country: 'BR' },
    });

    const account = await prisma.account.create({
      data: {
        portfolioId: portfolio.id,
        institutionId: institution.id,
        name: 'Custody Account Conv',
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

  it('1. Requires authentication (401 Unauthorized) across all conversation endpoints', async () => {
    const dummyId = '00000000-0000-4000-8000-000000000001';

    const resPost = await request(app.getHttpServer()).post(
      `/api/v1/portfolios/${dummyId}/ai/conversations`,
    );
    expect(resPost.status).toBe(401);

    const resList = await request(app.getHttpServer()).get(
      `/api/v1/portfolios/${dummyId}/ai/conversations`,
    );
    expect(resList.status).toBe(401);

    const resGet = await request(app.getHttpServer()).get(
      `/api/v1/portfolios/${dummyId}/ai/conversations/${dummyId}`,
    );
    expect(resGet.status).toBe(401);

    const resMsg = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${dummyId}/ai/conversations/${dummyId}/messages`)
      .send({ question: 'Olá' });
    expect(resMsg.status).toBe(401);
  });

  it('2. Enforces cross-user hidden 404 for conversations', async () => {
    const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const { portfolio } = await seedPortfolioWithLedger(userA);
    const sessionA = await createAuthenticatedUserSession(userA);
    await ensureUser(userB);
    const sessionB = await createAuthenticatedUserSession(userB);

    // Create conversation as User A
    const convRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations`)
      .set('Authorization', `Bearer ${sessionA.token}`)
      .send({ title: 'Conversa Secreta' });
    expect(convRes.status).toBe(201);
    const convId = convRes.body.data.id;

    // User B attempts to access conversation under portfolio
    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${convId}`)
      .set('Authorization', `Bearer ${sessionB.token}`);
    expect(getRes.status).toBe(404);

    // User B attempts to send message
    const msgRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${sessionB.token}`)
      .send({ question: 'Tentar espionar' });
    expect(msgRes.status).toBe(404);
  });

  it('3. Enforces cross-portfolio hidden 404 when conversation belongs to another portfolio of same user', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const { portfolio: p1 } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const p2 = await prisma.portfolio.create({
      data: {
        userId,
        name: 'Second Portfolio',
        baseCurrency: 'BRL',
        type: 'PERSONAL',
        status: 'ACTIVE',
      },
    });

    // Create conversation on p1
    const convRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${p1.id}/ai/conversations`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ title: 'Conversa P1' });
    expect(convRes.status).toBe(201);
    const convId = convRes.body.data.id;

    // Try to access conversation using p2 URL
    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${p2.id}/ai/conversations/${convId}`)
      .set('Authorization', `Bearer ${session.token}`);
    expect(getRes.status).toBe(404);
  });

  it('4. Full conversation lifecycle: Create, List, Get empty', async () => {
    const userId = '22222222-2222-4222-8222-222222222222';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    // Create
    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ title: 'Minha Análise' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.id).toBeDefined();
    expect(createRes.body.data.title).toBe('Minha Análise');
    expect(createRes.body.data.portfolioId).toBe(portfolio.id);

    const convId = createRes.body.data.id;

    // List
    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolio.id}/ai/conversations`)
      .set('Authorization', `Bearer ${session.token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(convId);
    expect(listRes.body.meta.hasMore).toBe(false);

    // Get
    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${convId}`)
      .set('Authorization', `Bearer ${session.token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(convId);
    expect(getRes.body.data.messages).toEqual([]);
  });

  it('5. Refuses prohibited recommendation intent without calling model (200 UNSUPPORTED)', async () => {
    const userId = '33333333-3333-4333-8333-333333333333';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({});
    const convId = createRes.body.data.id;

    const aiProvider = app.get<FakeAiProvider>(AI_PROVIDER_TOKEN);
    const initialCallCount = aiProvider.completedMessages.length;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ question: 'Qual ação devo comprar agora?' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNSUPPORTED');
    expect(res.body.data.intent).toBe('UNSUPPORTED_RECOMMENDATION');
    expect(res.body.data.answer).toContain('não recomenda compras');
    expect(res.body.data.evidence).toEqual([]);
    // Model provider must NOT have been called
    expect(aiProvider.completedMessages.length).toBe(initialCallCount);
  });

  it('6. Multi-turn conversation: Turn 1 (Supported) -> Turn 2 (Follow-up with Bounded History)', async () => {
    const userId = '44444444-4444-4444-8444-444444444444';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ title: 'Diálogo de Rentabilidade' });
    const convId = createRes.body.data.id;

    const aiProvider = app.get<FakeAiProvider>(AI_PROVIDER_TOKEN);

    // Turn 1: Direct question
    const turn1Res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        question: 'Como foi o desempenho da minha carteira?',
        startDate: DAYS[0],
        endDate: DAYS[DAYS.length - 1],
      });

    expect(turn1Res.status).toBe(200);
    const d1 = turn1Res.body.data;
    expect(d1.status).toBe('ANSWERED');
    expect(d1.intent).toBe('EXPLAIN_PERFORMANCE');
    expect(d1.evidence.length).toBeGreaterThan(0);
    expect(d1.evidence[0].factId).toBe('BRL.PERFORMANCE.TWR');

    // Turn 2: Follow-up question referencing recent context
    const turn2Res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        question: 'E contra o CDI?',
        startDate: DAYS[0],
        endDate: DAYS[DAYS.length - 1],
      });

    expect(turn2Res.status).toBe(200);
    const d2 = turn2Res.body.data;
    expect(d2.status).toBe('ANSWERED');

    // Verify messages sent to AI provider in Turn 2 included bounded history
    const lastProviderCall = aiProvider.completedMessages[aiProvider.completedMessages.length - 1]!;
    // Index 0: system policy
    expect(lastProviderCall[0]?.role).toBe('system');
    // Index 1: Turn 1 User message
    expect(lastProviderCall[1]?.role).toBe('user');
    expect(lastProviderCall[1]?.content).toContain('Como foi o desempenho');
    // Index 2: Turn 1 Assistant message
    expect(lastProviderCall[2]?.role).toBe('assistant');
    // Index 3: Turn 2 User message with fresh grounding context
    expect(lastProviderCall[3]?.role).toBe('user');
    expect(lastProviderCall[3]?.content).toContain('E contra o CDI?');
    expect(lastProviderCall[3]?.content).toContain('groundingContext');
  });

  it('7. CRITICAL INVARIANT: Fresh Grounding Per Turn (Turn 2 receives updated upstream metrics)', async () => {
    const userId = '55555555-5555-4555-8555-555555555555';
    const { portfolio, asset } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ title: 'Teste Fresh Grounding' });
    const convId = createRes.body.data.id;

    const aiProvider = app.get<FakeAiProvider>(AI_PROVIDER_TOKEN);

    // Turn 1
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        question: 'Qual a rentabilidade atual?',
        startDate: DAYS[0],
        endDate: DAYS[DAYS.length - 1],
      });

    const call1UserMsg = aiProvider.completedMessages[aiProvider.completedMessages.length - 1]![1]!;
    // Note: call1 has [system, user]
    const call1Payload = JSON.parse(call1UserMsg.content);
    const twrFact1 = call1Payload.groundingContext.facts.find(
      (f: { metric: string }) => f.metric === 'TWR',
    );
    expect(twrFact1).toBeDefined();
    const originalTwrValue = twrFact1.value;

    // Upstream change: simulate massive market price surge on the last day
    const lastDay = DAYS[DAYS.length - 1]!;
    historical.seed({
      ticker: asset.ticker,
      exchange: asset.exchange,
      date: lastDay,
      close: '100.00', // Jump from ~42 to 100
      currency: asset.currency,
    });

    // Turn 2
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        question: 'E agora?',
        startDate: DAYS[0],
        endDate: DAYS[DAYS.length - 1],
      });

    // Inspect the Turn 2 call to the model
    const call2Messages = aiProvider.completedMessages[aiProvider.completedMessages.length - 1]!;
    const call2UserMsg = call2Messages[call2Messages.length - 1]!;
    const call2Payload = JSON.parse(call2UserMsg.content);
    const twrFact2 = call2Payload.groundingContext.facts.find(
      (f: { metric: string }) => f.metric === 'TWR',
    );
    expect(twrFact2).toBeDefined();
    // Proves fresh grounding: Turn 2's TWR changed to reflect the new market prices
    expect(twrFact2.value).not.toBe(originalTwrValue);
  });

  it('8. CRITICAL INVARIANT: Historical Evidence Stability (Turn 1 evidence snapshot is immutable)', async () => {
    const userId = '66666666-6666-4666-8666-666666666666';
    const { portfolio, asset } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ title: 'Teste Imutabilidade Snapshot' });
    const convId = createRes.body.data.id;

    // Turn 1
    const t1Res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        question: 'Qual o retorno da carteira?',
        startDate: DAYS[0],
        endDate: DAYS[DAYS.length - 1],
      });

    expect(t1Res.status).toBe(200);
    expect(t1Res.body.data.evidence.length).toBeGreaterThan(0);
    const originalEvidenceValue = t1Res.body.data.evidence[0].value;

    // Shift market data
    historical.seed({
      ticker: asset.ticker,
      exchange: asset.exchange,
      date: DAYS[DAYS.length - 1]!,
      close: '200.00',
      currency: asset.currency,
    });

    // Turn 2
    await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        question: 'E o risco?',
        startDate: DAYS[0],
        endDate: DAYS[DAYS.length - 1],
      });

    // Query conversation from database directly or via GET endpoint
    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${convId}`)
      .set('Authorization', `Bearer ${session.token}`);

    const messages = getRes.body.data.messages;
    const pastAssistantMsg = messages.find(
      (m: { id: string }) => m.id === t1Res.body.data.assistantMessageId,
    );
    expect(pastAssistantMsg).toBeDefined();
    // The snapshot persisted in Turn 1 must still hold originalEvidenceValue
    expect(pastAssistantMsg.evidenceSnapshot[0].value).toBe(originalEvidenceValue);
  });

  it('9. Error handling: returns 503 if AI provider fails', async () => {
    const userId = '77777777-7777-4777-8777-777777777777';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({});
    const convId = createRes.body.data.id;

    const aiProvider = app.get<FakeAiProvider>(AI_PROVIDER_TOKEN);
    const spy = vi
      .spyOn(aiProvider, 'complete')
      .mockRejectedValueOnce(new Error('AI network timeout'));

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ question: 'Como foi o desempenho?' });

    expect(res.status).toBe(503);
    spy.mockRestore();
  });

  it('10. Error handling: returns 422 if model response cites unknown fact ID', async () => {
    const userId = '88888888-8888-4888-8888-888888888888';
    const { portfolio } = await seedPortfolioWithLedger(userId);
    const session = await createAuthenticatedUserSession(userId);

    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({});
    const convId = createRes.body.data.id;

    const aiProvider = app.get<FakeAiProvider>(AI_PROVIDER_TOKEN);
    const spy = vi.spyOn(aiProvider, 'complete').mockResolvedValueOnce({
      role: 'assistant',
      content: JSON.stringify({
        answer: 'Afirmação com fato inexistente.',
        evidenceFactIds: ['UNKNOWN_FACT_123'],
        limitations: [],
      }),
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/portfolios/${portfolio.id}/ai/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ question: 'Como foi o desempenho?' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('AI.INVALID_MODEL_RESPONSE');
    spy.mockRestore();
  });
});
