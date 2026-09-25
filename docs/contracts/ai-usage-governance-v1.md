# Contract: AI Usage & Context Budget Governance v1

## Specification

- **Schema Version**: `1`
- **Component**: `@atlas/ai-engine`, `@atlas/api`
- **ADRs**: ADR-206, ADR-207

---

## 1. Context Size Budget

Before any invocation of external AI providers (OpenAI or future providers), the system validates the byte length of the serialized prompt context against a bounded threshold:

- **Default Maximum Context Bytes**: `32,768` bytes (`AI_DEFAULT_MAX_CONTEXT_BYTES`).
- **Enforcement**: Pure function `validateContextBudget(serializedBytes, maxBytes)`.
- **Pre-Provider Rejection**: If `serializedBytes > maxBytes`, the pipeline immediately aborts with HTTP 400 (`AI.CONTEXT_BUDGET_EXCEEDED`). **Zero provider calls** are executed.

---

## 2. Token Usage Accounting

1. **CANONICAL OPERATIONAL USAGE**: When the provider reports token counts (`inputTokens`, `outputTokens`, `totalTokens`), these exact integers are recorded in telemetry with `source: 'PROVIDER'`.
2. **UNAVAILABLE REPORTING**: If the provider omits usage or fails before generating output, token fields are set to `null` with `source: 'UNAVAILABLE'`. The system **NEVER** fabricates `0` for missing usage.
3. **NOT APPLICABLE FOR UNSUPPORTED**: For requests classified as `UNSUPPORTED_*`, no provider calls occur. Tokens are set to `0` with `source: 'NOT_APPLICABLE'`.
4. **NO PRICING IN 3V**: Phase 3V tracks token counts only. Monetary cost estimation and pricing tables are deferred to future billing governance.
