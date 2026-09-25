import { describe, it, expect } from 'vitest';
import {
  TELEMETRY_SCHEMA_VERSION,
  AI_METRIC_NAMES,
  buildAiExecutionTelemetry,
  extractSafeMetricLabels,
  validateContextBudget,
  AI_DEFAULT_MAX_CONTEXT_BYTES,
  AiExecutionTelemetryV1,
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
