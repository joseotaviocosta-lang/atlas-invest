import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildPortfolioTimelineAiGroundingContext,
  buildConversationPrompt,
  AI_DEFAULT_MAX_CONTEXT_BYTES,
  MAX_AI_TIMELINE_EVENTS,
  FakeAiProvider,
  type AIMessage,
  type PortfolioAiEventV1,
  type PortfolioTimelineAiGroundingContextV1,
} from '@atlas/ai-engine';
import {
  measureProviderContextBytes,
  evaluateProviderContextBudget,
  contextBudgetExceededException,
  resolveMaxContextBytes,
} from '../../apps/api/src/application/ai/context-budget';
import { SendAiConversationMessageUseCase } from '../../apps/api/src/application/ai/send-ai-conversation-message.use-case';
import { StreamAiConversationMessageUseCase } from '../../apps/api/src/application/ai/stream-ai-conversation-message.use-case';
import { ExplainPortfolioWithAiUseCase } from '../../apps/api/src/application/ai/explain-portfolio-with-ai.use-case';

// ---------------------------------------------------------------------------
// Deterministic fixtures
// ---------------------------------------------------------------------------

const PORTFOLIO_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'user-1';
const PERIOD = { from: '2025-01-01', to: '2025-12-31' } as const;

function makeTimelineEvents(count: number): PortfolioAiEventV1[] {
  return Array.from({ length: count }, (_, i) => ({
    eventId: `evt-${String(i).padStart(6, '0')}`,
    eventType: (i % 2 === 0 ? 'BUY' : 'SELL') as PortfolioAiEventV1['eventType'],
    economicDate: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    assetId: `asset-${i % 5}`,
    symbol: `TCK${i % 5}`,
    quantity: '100',
    moneyAmount: '3752.48',
    currency: 'BRL',
    nature: 'HISTORICAL' as const,
  }));
}

function buildTimelineContext(candidateCount: number): PortfolioTimelineAiGroundingContextV1 {
  return buildPortfolioTimelineAiGroundingContext({
    portfolioId: PORTFOLIO_ID,
    period: PERIOD,
    scope: { type: 'TIMELINE', from: PERIOD.from, to: PERIOD.to },
    candidateEvents: makeTimelineEvents(candidateCount),
  });
}

/**
 * Builds an AIMessage[] payload whose exact serialized byte length equals `targetBytes`.
 */
function buildPayloadOfExactBytes(targetBytes: number): AIMessage[] {
  const overhead = measureProviderContextBytes([{ role: 'system', content: '' }]);
  const padding = targetBytes - overhead;
  if (padding < 0) throw new Error(`targetBytes ${targetBytes} below minimum ${overhead}`);
  return [{ role: 'system', content: 'x'.repeat(padding) }];
}

// ---------------------------------------------------------------------------
// Stub collaborators (zero I/O, zero DB, zero network)
// ---------------------------------------------------------------------------

class CountingAiProvider extends FakeAiProvider {
  public callCount = 0;
  async complete(messages: AIMessage[], options?: Parameters<FakeAiProvider['complete']>[1]) {
    this.callCount += 1;
    return super.complete(messages, options);
  }
}

function answeringProvider(context: { facts: readonly { factId: string }[] }) {
  const factId = context.facts[0]!.factId;
  return new CountingAiProvider({
    customResponse: {
      claims: [
        {
          type: 'FACTUAL_METRIC',
          segments: [
            { type: 'TEXT', text: 'Evento registrado no periodo: ' },
            { type: 'FACT_VALUE', factId },
          ],
        },
      ],
      evidenceFactIds: [factId],
      limitations: [],
    } as never,
  });
}

interface PersistedTurn {
  status?: string;
}

function makeConversationRepositoryStub(persisted: PersistedTurn[]) {
  return {
    findConversationById: async () => ({
      id: CONVERSATION_ID,
      portfolioId: PORTFOLIO_ID,
      userId: USER_ID,
      title: 'Timeline',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    }),
    listMessages: async () => ({ items: [] }),
    appendTurn: async (
      _conversationId: string,
      _userMessage: unknown,
      assistantMessage: PersistedTurn,
    ) => {
      persisted.push(assistantMessage);
      return {
        userMessage: { id: 'user-msg-1' },
        assistantMessage: { id: 'assistant-msg-1' },
      };
    },
  } as never;
}

function makeTimelineGroundingStub(context: PortfolioTimelineAiGroundingContextV1) {
  return { execute: async () => context } as never;
}

const unusedGroundingStub = {
  execute: async () => {
    throw new Error('unexpected portfolio grounding call');
  },
} as never;

function makeSendUseCase(
  context: PortfolioTimelineAiGroundingContextV1,
  provider: CountingAiProvider,
  persisted: PersistedTurn[],
) {
  return new SendAiConversationMessageUseCase(
    makeConversationRepositoryStub(persisted),
    unusedGroundingStub,
    unusedGroundingStub,
    makeTimelineGroundingStub(context),
    provider,
  );
}

function makeStreamUseCase(
  context: PortfolioTimelineAiGroundingContextV1,
  provider: CountingAiProvider,
  persisted: PersistedTurn[],
) {
  return new StreamAiConversationMessageUseCase(
    makeConversationRepositoryStub(persisted),
    unusedGroundingStub,
    unusedGroundingStub,
    makeTimelineGroundingStub(context),
    provider,
  );
}

const TIMELINE_QUESTION = 'Explique os eventos registrados na minha carteira neste periodo.';

function timelineInput(context: PortfolioTimelineAiGroundingContextV1) {
  return {
    portfolioId: PORTFOLIO_ID,
    conversationId: CONVERSATION_ID,
    userId: USER_ID,
    question: TIMELINE_QUESTION,
    scope: {
      type: 'TIMELINE' as const,
      from: context.period.from,
      to: context.period.to,
    },
  };
}

function collectStreamEvents(chunks: string[]) {
  return chunks
    .join('')
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => {
      try {
        return JSON.parse(l.slice(5).trim()) as {
          type?: string;
          data?: { code?: string };
        };
      } catch {
        return {};
      }
    });
}

// ---------------------------------------------------------------------------

describe('Phase 3X Hotfix: TOTAL provider context budget enforcement', () => {
  const originalEnv = process.env.AI_MAX_CONTEXT_BYTES;

  beforeEach(() => {
    delete process.env.AI_MAX_CONTEXT_BYTES;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.AI_MAX_CONTEXT_BYTES;
    else process.env.AI_MAX_CONTEXT_BYTES = originalEnv;
  });

  describe('Authoritative measurement covers the ENTIRE provider payload', () => {
    it('measures the exact AIMessage[] array handed to the provider', () => {
      const messages: AIMessage[] = [
        { role: 'system', content: 'policy' },
        { role: 'user', content: 'question' },
      ];
      expect(measureProviderContextBytes(messages)).toBe(
        Buffer.byteLength(JSON.stringify(messages), 'utf8'),
      );
    });

    it('includes system policy, history and grounding — not only event facts', () => {
      const context = buildTimelineContext(10);
      const { messages } = buildConversationPrompt(context, TIMELINE_QUESTION, 'TIMELINE', []);
      const total = measureProviderContextBytes(messages);
      const eventsOnly = Buffer.byteLength(JSON.stringify(context.events), 'utf8');
      const factsOnly = Buffer.byteLength(JSON.stringify(context.facts), 'utf8');

      expect(total).toBeGreaterThan(eventsOnly);
      expect(total).toBeGreaterThan(factsOnly);
    });

    it('defaults to the frozen 32768-byte budget', () => {
      expect(AI_DEFAULT_MAX_CONTEXT_BYTES).toBe(32768);
      expect(resolveMaxContextBytes()).toBe(32768);
    });
  });

  describe('Exact boundary semantics (<= 32768 allowed, > 32768 blocked)', () => {
    it('allows a payload measuring exactly 32768 bytes', () => {
      const messages = buildPayloadOfExactBytes(32768);
      expect(measureProviderContextBytes(messages)).toBe(32768);

      const decision = evaluateProviderContextBudget(messages);
      expect(decision.sizeBytes).toBe(32768);
      expect(decision.maxBytes).toBe(32768);
      expect(decision.ok).toBe(true);
    });

    it('blocks a payload measuring exactly 32769 bytes', () => {
      const messages = buildPayloadOfExactBytes(32769);
      expect(measureProviderContextBytes(messages)).toBe(32769);

      const decision = evaluateProviderContextBudget(messages);
      expect(decision.sizeBytes).toBe(32769);
      expect(decision.ok).toBe(false);

      const exception = contextBudgetExceededException(decision);
      expect(exception.getStatus()).toBe(400);
      expect((exception.getResponse() as { code: string }).code).toBe('AI.CONTEXT_BUDGET_EXCEEDED');
    });

    it('blocks the large 94836-byte payload class', () => {
      const messages = buildPayloadOfExactBytes(94836);
      const decision = evaluateProviderContextBudget(messages);
      expect(decision.sizeBytes).toBe(94836);
      expect(decision.ok).toBe(false);
    });
  });

  describe('Event cap is an earlier bound, NOT the final budget gate', () => {
    it('caps at 50 events for 50 / 51 / 5000 candidates', () => {
      expect(MAX_AI_TIMELINE_EVENTS).toBe(50);

      const at50 = buildTimelineContext(50);
      expect(at50.events.length).toBe(50);
      expect(at50.summaryFacts.hasMore).toBe(false);

      const at51 = buildTimelineContext(51);
      expect(at51.events.length).toBe(50);
      expect(at51.summaryFacts.hasMore).toBe(true);

      const at5000 = buildTimelineContext(5000);
      expect(at5000.events.length).toBe(50);
      expect(at5000.summaryFacts.totalMatchingEvents).toBe(5000);
      expect(at5000.summaryFacts.hasMore).toBe(true);
    });

    it('a capped 5000-event context can still exceed the TOTAL budget and must be blocked', () => {
      const context = buildTimelineContext(5000);
      const { messages } = buildConversationPrompt(context, TIMELINE_QUESTION, 'TIMELINE', []);
      const decision = evaluateProviderContextBudget(messages);

      // Event cap held at 50, yet the total payload is what decides.
      expect(context.events.length).toBe(50);
      expect(decision.sizeBytes).toBeGreaterThan(AI_DEFAULT_MAX_CONTEXT_BYTES);
      expect(decision.ok).toBe(false);
    });
  });

  describe('Synchronous path', () => {
    it('over-budget request performs ZERO provider calls and returns AI.CONTEXT_BUDGET_EXCEEDED', async () => {
      const context = buildTimelineContext(5000);
      const provider = answeringProvider(context);
      const persisted: PersistedTurn[] = [];
      const useCase = makeSendUseCase(context, provider, persisted);

      await expect(useCase.execute(timelineInput(context))).rejects.toMatchObject({
        response: { code: 'AI.CONTEXT_BUDGET_EXCEEDED' },
      });

      expect(provider.callCount).toBe(0);
      expect(persisted.filter((m) => m.status === 'ANSWERED')).toHaveLength(0);
    });

    it('under-budget request calls the provider exactly once and answers', async () => {
      const context = buildTimelineContext(5);
      const provider = answeringProvider(context);
      const persisted: PersistedTurn[] = [];
      const useCase = makeSendUseCase(context, provider, persisted);

      const { messages } = buildConversationPrompt(context, TIMELINE_QUESTION, 'TIMELINE', []);
      expect(measureProviderContextBytes(messages)).toBeLessThanOrEqual(
        AI_DEFAULT_MAX_CONTEXT_BYTES,
      );

      const result = await useCase.execute(timelineInput(context));

      expect(result.status).toBe('ANSWERED');
      expect(provider.callCount).toBe(1);
    });

    it('budget decision happens BEFORE the provider call', async () => {
      const context = buildTimelineContext(5000);
      const provider = answeringProvider(context);
      const useCase = makeSendUseCase(context, provider, []);

      await expect(useCase.execute(timelineInput(context))).rejects.toBeTruthy();
      // Provider never observed any payload at all.
      expect(provider.completedMessages).toHaveLength(0);
    });
  });

  describe('Streaming path', () => {
    it('over-budget stream emits ERROR, never FINAL, with ZERO provider calls', async () => {
      const context = buildTimelineContext(5000);
      const provider = answeringProvider(context);
      const persisted: PersistedTurn[] = [];
      const useCase = makeStreamUseCase(context, provider, persisted);

      const chunks: string[] = [];
      await useCase.executeStream(timelineInput(context), (c) => chunks.push(c));

      const events = collectStreamEvents(chunks);
      const errorEvent = events.find((e) => e.type === 'ERROR');

      expect(provider.callCount).toBe(0);
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.data?.code).toBe('AI.CONTEXT_BUDGET_EXCEEDED');
      expect(events.some((e) => e.type === 'FINAL')).toBe(false);
      expect(persisted.filter((m) => m.status === 'ANSWERED')).toHaveLength(0);
    });

    it('under-budget stream reaches FINAL with exactly one provider call', async () => {
      const context = buildTimelineContext(5);
      const provider = answeringProvider(context);
      const useCase = makeStreamUseCase(context, provider, []);

      const chunks: string[] = [];
      await useCase.executeStream(timelineInput(context), (c) => chunks.push(c));

      const events = collectStreamEvents(chunks);
      expect(provider.callCount).toBe(1);
      expect(events.some((e) => e.type === 'FINAL')).toBe(true);
      expect(events.some((e) => e.type === 'ERROR')).toBe(false);
    });
  });

  describe('Sync / stream parity', () => {
    it('the same over-budget payload yields AI.CONTEXT_BUDGET_EXCEEDED on both paths with 0 provider calls', async () => {
      const context = buildTimelineContext(5000);

      const syncProvider = answeringProvider(context);
      let syncCode: string | undefined;
      try {
        await makeSendUseCase(context, syncProvider, []).execute(timelineInput(context));
      } catch (err) {
        syncCode = (err as { response?: { code?: string } }).response?.code;
      }

      const streamProvider = answeringProvider(context);
      const chunks: string[] = [];
      await makeStreamUseCase(context, streamProvider, []).executeStream(
        timelineInput(context),
        (c) => chunks.push(c),
      );
      const streamCode = collectStreamEvents(chunks).find((e) => e.type === 'ERROR')?.data?.code;

      expect(syncCode).toBe('AI.CONTEXT_BUDGET_EXCEEDED');
      expect(streamCode).toBe('AI.CONTEXT_BUDGET_EXCEEDED');
      expect(syncProvider.callCount).toBe(0);
      expect(streamProvider.callCount).toBe(0);
    });
  });

  describe('Explanation path (POST /ai/explain) is gated too', () => {
    it('over-budget explanation performs ZERO provider calls', async () => {
      const bloatedContext = {
        schemaVersion: '1',
        portfolioId: PORTFOLIO_ID,
        facts: Array.from({ length: 400 }, (_, i) => ({
          factId: `BRL.OVERVIEW.PADDING_${i}`,
          category: 'OVERVIEW',
          metric: `PADDING_${i}`,
          scope: 'BRL',
          value: '1234.56',
          unit: 'MONEY',
          nature: 'POINT_IN_TIME',
          status: 'AVAILABLE',
          label: `Metrica de preenchimento numero ${i} para inflar o contexto do provedor`,
          source: { contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1', path: `padding.${i}` },
        })),
        limitations: [],
        analysisPeriod: { startDate: PERIOD.from, endDate: PERIOD.to },
        asOf: PERIOD.to,
        dataQuality: { status: 'AVAILABLE', availability: 'AVAILABLE', reasonCodes: [] },
        capabilities: {
          canExplainPortfolioFacts: true,
          canRecommendTrades: false,
          canPredictReturns: false,
          canCalculateNewMetrics: false,
        },
        currencies: ['BRL'],
      } as never;

      const provider = new CountingAiProvider();
      const useCase = new ExplainPortfolioWithAiUseCase(
        { execute: async () => bloatedContext } as never,
        provider,
      );

      await expect(
        useCase.execute({
          portfolioId: PORTFOLIO_ID,
          userId: USER_ID,
          question: 'Explique a composicao atual da minha carteira.',
        }),
      ).rejects.toMatchObject({
        response: { code: 'AI.CONTEXT_BUDGET_EXCEEDED' },
      });

      expect(provider.callCount).toBe(0);
      expect(provider.completedMessages).toHaveLength(0);
    });
  });
});
