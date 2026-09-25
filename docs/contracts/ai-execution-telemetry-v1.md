# Contract: AI Execution Telemetry v1

## Specification

- **Schema Version**: `1`
- **Component**: `@atlas/ai-engine`, `@atlas/api`
- **ADRs**: ADR-204, ADR-205, ADR-209

---

## 1. Overview

`AiExecutionTelemetryV1` defines the canonical, provider-agnostic, privacy-safe execution record emitted exactly once per completed AI pipeline execution (sync message or stream message).

Telemetry records describe the operational execution of the pipeline (latencies, counts, token usage, errors) without capturing raw inputs, prompts, grounding context, or financial fact values.

---

## 2. Structure

```typescript
export interface AiExecutionTelemetryV1 {
  readonly schemaVersion: '1';
  readonly requestId: string;
  readonly operation: 'EXPLANATION' | 'CONVERSATION_MESSAGE' | 'CONVERSATION_STREAM';
  readonly deliveryMode: 'SYNC' | 'STREAM';
  readonly intent: string;
  readonly status:
    | 'ANSWERED'
    | 'UNSUPPORTED'
    | 'PROVIDER_ERROR'
    | 'VALIDATION_ERROR'
    | 'PERSISTENCE_ERROR'
    | 'OWNERSHIP_ERROR'
    | 'BUDGET_EXCEEDED'
    | 'ABORTED';
  readonly provider: string;
  readonly model: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durations: AiExecutionDurationsV1;
  readonly usage: AiTokenUsageV1;
  readonly counts: AiExecutionCountsV1;
  readonly portfolioId?: string;
  readonly conversationId?: string;
  readonly errorCode?: string;
  readonly retryable?: boolean;
}
```

---

## 3. Privacy & Data Minimization Invariants

1. **NO RAW PROMPTS**: Telemetry records never contain `prompt`, `system`, or `user` raw payload.
2. **NO RAW QUESTIONS**: Only `counts.questionLength` (character count) is recorded.
3. **NO FINANCIAL FACTS**: Grounding facts, fact values, and ledger values are excluded. Only counts (`groundingFactCount`, `groundingSerializedBytes`) are recorded.
4. **NO CREDENTIALS / PII**: Telemetry records never store API keys, bearer tokens, passwords, CPFs, or user emails.
5. **FAIL-OPEN SINK**: Failures in recording telemetry (e.g. logging errors) must never throw or disrupt the delivery of answers to users.
