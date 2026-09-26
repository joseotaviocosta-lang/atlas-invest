import { describe, it, expect } from 'vitest';
import {
  TELEMETRY_SCHEMA_VERSION,
  AI_METRIC_NAMES,
  buildAiExecutionTelemetry,
  extractSafeMetricLabels,
  validateContextBudget,
  AI_DEFAULT_MAX_CONTEXT_BYTES,
  AiExecutionTelemetryV1,
  isValidTokenCount,
  normalizeProviderUsage,
} from '@atlas/ai-engine';

describe('Phase 3V: AI Reliability, Observability & Usage Governance', () => {
  describe('1. Pure Telemetry Builder (buildAiExecutionTelemetry)', () => {
    it('builds canonical version 1 execution telemetry with exact schema', () => {
      const telemetry = buildAiExecutionTelemetry({
        requestId: 'req-12345',
        operation: 'CONVERSATION_MESSAGE',
        deliveryMode: 'SYNC',
        intent: 'PORTFOLIO_PERFORMANCE',
        status: 'ANSWERED',
        provider: 'openai',
        model: 'gpt-4o-mini',
        startedAt: '2026-09-25T14:00:00.000Z',
        completedAt: '2026-09-25T14:00:00.450Z',
        durations: {
          totalMs: 450.23,
          intentGateMs: 12.11,
          ownershipMs: 8.5,
          historyLoadMs: 15.2,
          groundingMs: 85.4,
          promptBuildMs: 5.1,
          providerMs: 310.2,
          claimValidationMs: 6.8,
          renderMs: 2.1,
          persistenceMs: 4.8,
        },
        usage: {
          inputTokens: 1250,
          outputTokens: 180,
          totalTokens: 1430,
          source: 'PROVIDER',
        },
        counts: {
          groundingCallCount: 1,
          providerCallCount: 1,
          claimValidationCount: 1,
          rendererCount: 1,
          claimCount: 3,
          evidenceCount: 3,
          questionLength: 28,
          historyMessageCount: 4,
          historyChars: 1200,
          groundingFactCount: 18,
          groundingSerializedBytes: 4500,
        },
        portfolioId: 'port-111',
        conversationId: 'conv-222',
      });

      expect(telemetry.schemaVersion).toBe(TELEMETRY_SCHEMA_VERSION);
      expect(telemetry.requestId).toBe('req-12345');
      expect(telemetry.operation).toBe('CONVERSATION_MESSAGE');
      expect(telemetry.deliveryMode).toBe('SYNC');
      expect(telemetry.intent).toBe('PORTFOLIO_PERFORMANCE');
      expect(telemetry.status).toBe('ANSWERED');
      expect(telemetry.provider).toBe('openai');
      expect(telemetry.model).toBe('gpt-4o-mini');
      expect(telemetry.durations.totalMs).toBe(450.23);
      expect(telemetry.durations.providerMs).toBe(310.2);
      expect(telemetry.usage.inputTokens).toBe(1250);
      expect(telemetry.usage.outputTokens).toBe(180);
      expect(telemetry.usage.totalTokens).toBe(1430);
      expect(telemetry.usage.source).toBe('PROVIDER');
      expect(telemetry.counts.providerCallCount).toBe(1);
      expect(telemetry.counts.groundingCallCount).toBe(1);
      expect(Object.isFrozen(telemetry)).toBe(true);
      expect(Object.isFrozen(telemetry.durations)).toBe(true);
      expect(Object.isFrozen(telemetry.usage)).toBe(true);
      expect(Object.isFrozen(telemetry.counts)).toBe(true);
    });

    it('sanitizes missing token usage to null with source UNAVAILABLE (never fabricates 0)', () => {
      const telemetry = buildAiExecutionTelemetry({
        requestId: 'req-missing-usage',
        operation: 'CONVERSATION_MESSAGE',
        deliveryMode: 'SYNC',
        intent: 'PORTFOLIO_PERFORMANCE',
        status: 'ANSWERED',
        provider: 'openai',
        model: 'gpt-4o-mini',
        startedAt: '2026-09-25T14:00:00.000Z',
        completedAt: '2026-09-25T14:00:00.200Z',
        durations: { totalMs: 200 },
        usage: {
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined,
        },
        counts: {
          groundingCallCount: 1,
          providerCallCount: 1,
          claimValidationCount: 1,
          rendererCount: 1,
          questionLength: 20,
        },
      });

      expect(telemetry.usage.inputTokens).toBeNull();
      expect(telemetry.usage.outputTokens).toBeNull();
      expect(telemetry.usage.totalTokens).toBeNull();
      expect(telemetry.usage.source).toBe('UNAVAILABLE');
    });

    it('sets usage source NOT_APPLICABLE and tokens to 0 for UNSUPPORTED requests', () => {
      const telemetry = buildAiExecutionTelemetry({
        requestId: 'req-unsupported',
        operation: 'CONVERSATION_MESSAGE',
        deliveryMode: 'SYNC',
        intent: 'UNSUPPORTED_RECOMMENDATION',
        status: 'UNSUPPORTED',
        provider: 'openai',
        model: 'gpt-4o-mini',
        startedAt: '2026-09-25T14:00:00.000Z',
        completedAt: '2026-09-25T14:00:00.020Z',
        durations: { totalMs: 20, intentGateMs: 5, persistenceMs: 15 },
        usage: {
          source: 'NOT_APPLICABLE',
        },
        counts: {
          groundingCallCount: 0,
          providerCallCount: 0,
          claimValidationCount: 0,
          rendererCount: 0,
          questionLength: 18,
        },
      });

      expect(telemetry.status).toBe('UNSUPPORTED');
      expect(telemetry.usage.source).toBe('NOT_APPLICABLE');
      expect(telemetry.usage.inputTokens).toBe(0);
      expect(telemetry.usage.outputTokens).toBe(0);
      expect(telemetry.usage.totalTokens).toBe(0);
      expect(telemetry.counts.providerCallCount).toBe(0);
      expect(telemetry.counts.groundingCallCount).toBe(0);
    });
  });

  describe('1b. Strict Provider Token Usage Validation (ADR-206 Hotfix)', () => {
    it('isValidTokenCount returns true only for finite, non-negative safe integers', () => {
      expect(isValidTokenCount(0)).toBe(true);
      expect(isValidTokenCount(1)).toBe(true);
      expect(isValidTokenCount(1000)).toBe(true);
      expect(isValidTokenCount(Number.MAX_SAFE_INTEGER)).toBe(true);

      // Prohibited: negative numbers
      expect(isValidTokenCount(-1)).toBe(false);
      expect(isValidTokenCount(-100)).toBe(false);

      // Prohibited: fractional numbers (no floor/round)
      expect(isValidTokenCount(10.5)).toBe(false);
      expect(isValidTokenCount(0.1)).toBe(false);
      expect(isValidTokenCount(1e-5)).toBe(false);

      // Prohibited: strings (no parseInt/coercion)
      expect(isValidTokenCount('100')).toBe(false);
      expect(isValidTokenCount('0')).toBe(false);
      expect(isValidTokenCount('')).toBe(false);

      // Prohibited: unsafe integers / non-finite / special values
      expect(isValidTokenCount(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
      expect(isValidTokenCount(Infinity)).toBe(false);
      expect(isValidTokenCount(-Infinity)).toBe(false);
      expect(isValidTokenCount(NaN)).toBe(false);
      expect(isValidTokenCount(null)).toBe(false);
      expect(isValidTokenCount(undefined)).toBe(false);
      expect(isValidTokenCount({})).toBe(false);
    });

    it('normalizeProviderUsage accepts valid non-negative safe integers matching arithmetic sum', () => {
      const usage = normalizeProviderUsage({
        prompt_tokens: 120,
        completion_tokens: 30,
        total_tokens: 150,
      });

      expect(usage.source).toBe('PROVIDER');
      expect(usage.inputTokens).toBe(120);
      expect(usage.outputTokens).toBe(30);
      expect(usage.totalTokens).toBe(150);
      expect(Object.isFrozen(usage)).toBe(true);
    });

    it('normalizeProviderUsage accepts zero when actually reported by provider (0 / 0 / 0)', () => {
      const usage = normalizeProviderUsage({
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      });

      expect(usage.source).toBe('PROVIDER');
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.totalTokens).toBe(0);
    });

    it('normalizeProviderUsage marks UNAVAILABLE when total tokens does not match sum (no silent recomputation)', () => {
      const usage = normalizeProviderUsage({
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 999, // Arithmetic mismatch
      });

      expect(usage.source).toBe('UNAVAILABLE');
      expect(usage.inputTokens).toBeNull();
      expect(usage.outputTokens).toBeNull();
      expect(usage.totalTokens).toBeNull();
    });

    it('normalizeProviderUsage enforces atomic all-or-nothing rejection (no partial usage)', () => {
      // Input is string, output is number, total is valid sum
      const stringUsage = normalizeProviderUsage({
        prompt_tokens: '100',
        completion_tokens: 20,
        total_tokens: 120,
      });
      expect(stringUsage.source).toBe('UNAVAILABLE');
      expect(stringUsage.inputTokens).toBeNull();
      expect(stringUsage.outputTokens).toBeNull();
      expect(stringUsage.totalTokens).toBeNull();

      // Fractional total
      const fracUsage = normalizeProviderUsage({
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120.5,
      });
      expect(fracUsage.source).toBe('UNAVAILABLE');
      expect(fracUsage.inputTokens).toBeNull();
      expect(fracUsage.outputTokens).toBeNull();
      expect(fracUsage.totalTokens).toBeNull();

      // Negative prompt tokens (never clamped to 0)
      const negUsage = normalizeProviderUsage({
        prompt_tokens: -5,
        completion_tokens: 20,
        total_tokens: 15,
      });
      expect(negUsage.source).toBe('UNAVAILABLE');
      expect(negUsage.inputTokens).toBeNull();
      expect(negUsage.outputTokens).toBeNull();
      expect(negUsage.totalTokens).toBeNull();

      // Unsafe integer
      const unsafeUsage = normalizeProviderUsage({
        prompt_tokens: Number.MAX_SAFE_INTEGER + 10,
        completion_tokens: 0,
        total_tokens: Number.MAX_SAFE_INTEGER + 10,
      });
      expect(unsafeUsage.source).toBe('UNAVAILABLE');
      expect(unsafeUsage.inputTokens).toBeNull();
      expect(unsafeUsage.outputTokens).toBeNull();
      expect(unsafeUsage.totalTokens).toBeNull();
    });

    it('normalizeProviderUsage handles missing, null, and empty usage objects', () => {
      expect(normalizeProviderUsage(null).source).toBe('UNAVAILABLE');
      expect(normalizeProviderUsage(null).inputTokens).toBeNull();
      expect(normalizeProviderUsage(undefined).source).toBe('UNAVAILABLE');
      expect(normalizeProviderUsage({}).source).toBe('UNAVAILABLE');
    });

    it('normalizeProviderUsage returns NOT_APPLICABLE for UNSUPPORTED or CONTEXT_BUDGET_EXCEEDED status', () => {
      const unsupported = normalizeProviderUsage(null, 'UNSUPPORTED');
      expect(unsupported.source).toBe('NOT_APPLICABLE');
      expect(unsupported.inputTokens).toBe(0);
      expect(unsupported.outputTokens).toBe(0);
      expect(unsupported.totalTokens).toBe(0);

      const budgetExceeded = normalizeProviderUsage(null, 'CONTEXT_BUDGET_EXCEEDED');
      expect(budgetExceeded.source).toBe('NOT_APPLICABLE');
      expect(budgetExceeded.inputTokens).toBe(0);
      expect(budgetExceeded.outputTokens).toBe(0);
      expect(budgetExceeded.totalTokens).toBe(0);
    });

    it('buildAiExecutionTelemetry does NOT break response when usage is malformed (telemetry fail-open invariant)', () => {
      const telemetry = buildAiExecutionTelemetry({
        requestId: 'req-malformed-usage',
        operation: 'CONVERSATION_MESSAGE',
        deliveryMode: 'SYNC',
        intent: 'PORTFOLIO_PERFORMANCE',
        status: 'ANSWERED',
        provider: 'openai',
        model: 'gpt-4o-mini',
        startedAt: '2026-09-25T14:00:00.000Z',
        completedAt: '2026-09-25T14:00:00.250Z',
        durations: { totalMs: 250 },
        usage: {
          inputTokens: 100.75, // Fractional!
          outputTokens: 20,
          totalTokens: 120.75,
        } as unknown as Record<string, unknown>,
        counts: {
          groundingCallCount: 1,
          providerCallCount: 1,
          claimValidationCount: 1,
          rendererCount: 1,
          questionLength: 22,
        },
      });

      // Status remains ANSWERED — user response is NEVER failed by malformed usage telemetry
      expect(telemetry.status).toBe('ANSWERED');
      // Usage is safely marked UNAVAILABLE with all nulls
      expect(telemetry.usage.source).toBe('UNAVAILABLE');
      expect(telemetry.usage.inputTokens).toBeNull();
      expect(telemetry.usage.outputTokens).toBeNull();
      expect(telemetry.usage.totalTokens).toBeNull();
    });
  });

  describe('2. Metrics & Low-Cardinality Dimension Boundary (ADR-209)', () => {
    it('extractSafeMetricLabels extracts only bounded, low-cardinality dimensions', () => {
      const telemetry = buildAiExecutionTelemetry({
        requestId: 'sensitive-uuid-1111-2222',
        portfolioId: 'sensitive-portfolio-3333',
        conversationId: 'sensitive-conversation-4444',
        operation: 'CONVERSATION_STREAM',
        deliveryMode: 'STREAM',
        intent: 'PORTFOLIO_RISK',
        status: 'PROVIDER_ERROR',
        provider: 'openai',
        model: 'gpt-4o-mini',
        startedAt: '2026-09-25T14:00:00.000Z',
        completedAt: '2026-09-25T14:00:00.300Z',
        durations: { totalMs: 300, providerMs: 280 },
        usage: { source: 'UNAVAILABLE' },
        counts: {
          groundingCallCount: 1,
          providerCallCount: 1,
          claimValidationCount: 0,
          rendererCount: 0,
          streamEventCount: 4,
          questionLength: 15,
        },
        errorCode: 'AI.PROVIDER_TIMEOUT',
        retryable: true,
      });

      const labels = extractSafeMetricLabels(telemetry);

      // Verifies low-cardinality keys exist
      expect(labels.operation).toBe('CONVERSATION_STREAM');
      expect(labels.deliveryMode).toBe('STREAM');
      expect(labels.intent).toBe('PORTFOLIO_RISK');
      expect(labels.status).toBe('PROVIDER_ERROR');
      expect(labels.provider).toBe('openai');
      expect(labels.model).toBe('gpt-4o-mini');
      expect(labels.errorCode).toBe('AI.PROVIDER_TIMEOUT');

      // CRITICAL: High-cardinality IDs MUST NEVER be present in metric labels
      expect((labels as Record<string, unknown>).requestId).toBeUndefined();
      expect((labels as Record<string, unknown>).portfolioId).toBeUndefined();
      expect((labels as Record<string, unknown>).conversationId).toBeUndefined();
      expect((labels as Record<string, unknown>).userId).toBeUndefined();
    });

    it('verifies standard canonical metric names', () => {
      expect(AI_METRIC_NAMES.REQUESTS_TOTAL).toBe('atlas.ai.requests.total');
      expect(AI_METRIC_NAMES.REQUESTS_DURATION_MS).toBe('atlas.ai.requests.duration_ms');
      expect(AI_METRIC_NAMES.PROVIDER_DURATION_MS).toBe('atlas.ai.provider.duration_ms');
      expect(AI_METRIC_NAMES.TOKENS_TOTAL).toBe('atlas.ai.tokens.total');
      expect(AI_METRIC_NAMES.ERRORS_TOTAL).toBe('atlas.ai.errors.total');
      expect(AI_METRIC_NAMES.UNSUPPORTED_TOTAL).toBe('atlas.ai.unsupported.total');
      expect(AI_METRIC_NAMES.CONTEXT_BUDGET_EXCEEDED_TOTAL).toBe(
        'atlas.ai.context_budget_exceeded.total',
      );
    });
  });

  describe('3. Context Budget Governance (ADR-207)', () => {
    it('accepts request within context budget', () => {
      const result = validateContextBudget(5000, 32768);
      expect(result.ok).toBe(true);
      expect(result.sizeBytes).toBe(5000);
      expect(result.maxBytes).toBe(32768);
    });

    it('accepts request exactly at context budget boundary', () => {
      const result = validateContextBudget(32768, 32768);
      expect(result.ok).toBe(true);
      expect(result.sizeBytes).toBe(32768);
      expect(result.maxBytes).toBe(32768);
    });

    it('rejects request exceeding context budget by even 1 byte', () => {
      const result = validateContextBudget(32769, 32768);
      expect(result.ok).toBe(false);
      expect(result.sizeBytes).toBe(32769);
      expect(result.maxBytes).toBe(32768);
    });

    it('uses AI_DEFAULT_MAX_CONTEXT_BYTES when maxBytes is omitted', () => {
      const result = validateContextBudget(10000);
      expect(result.maxBytes).toBe(AI_DEFAULT_MAX_CONTEXT_BYTES);
      expect(result.ok).toBe(true);
    });
  });

  describe('4. Privacy & Data Minimization (ADR-205)', () => {
    it('telemetry structure contains zero raw questions, zero raw prompt, zero financial fact values', () => {
      const telemetry: AiExecutionTelemetryV1 = buildAiExecutionTelemetry({
        requestId: 'req-privacy-check',
        operation: 'CONVERSATION_MESSAGE',
        deliveryMode: 'SYNC',
        intent: 'PORTFOLIO_PERFORMANCE',
        status: 'ANSWERED',
        provider: 'openai',
        model: 'gpt-4o-mini',
        startedAt: '2026-09-25T14:00:00.000Z',
        completedAt: '2026-09-25T14:00:00.350Z',
        durations: { totalMs: 350 },
        usage: { inputTokens: 500, outputTokens: 100, totalTokens: 600, source: 'PROVIDER' },
        counts: {
          groundingCallCount: 1,
          providerCallCount: 1,
          claimValidationCount: 1,
          rendererCount: 1,
          claimCount: 2,
          evidenceCount: 2,
          questionLength: 35,
          historyMessageCount: 2,
          historyChars: 500,
          groundingFactCount: 12,
          groundingSerializedBytes: 2400,
        },
      });

      const serialized = JSON.stringify(telemetry);

      // Verify prohibited fields are completely absent from serialized payload
      expect(serialized).not.toContain('question":');
      expect(serialized).not.toContain('prompt":');
      expect(serialized).not.toContain('answer":');
      expect(serialized).not.toContain('groundingContext":');
      expect(serialized).not.toContain('facts":');
      expect(serialized).not.toContain('evidenceFactIds":');
      expect(serialized).not.toContain('cpf');
      expect(serialized).not.toContain('email');
      expect(serialized).not.toContain('token');
      expect(serialized).not.toContain('password');

      // Only metadata and counts are preserved
      expect(telemetry.counts.questionLength).toBe(35);
      expect(telemetry.counts.groundingFactCount).toBe(12);
      expect(telemetry.counts.claimCount).toBe(2);
    });
  });
});
