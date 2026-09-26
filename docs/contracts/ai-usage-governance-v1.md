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

1. **CANONICAL OPERATIONAL USAGE**: When the provider reports token counts (`inputTokens`, `outputTokens`, `totalTokens`), these exact integers are validated via `isValidTokenCount` and recorded in telemetry with `source: 'PROVIDER'`.
2. **STRICT NON-NEGATIVE SAFE INTEGERS**: All token counts must satisfy `typeof val === 'number' && Number.isFinite(val) && Number.isSafeInteger(val) && val >= 0`. String parsing, `Math.floor`, `Math.round`, and negative clamping (`Math.max(0, ...)`) are **STRICTLY PROHIBITED**.
3. **ATOMIC ALL-OR-NOTHING VALIDATION**: If any token field is invalid, missing, or malformed, the entire usage envelope is invalidated to `source: 'UNAVAILABLE'` with `null` across all token fields. Partial or fabricated token states are forbidden.
4. **TOTAL TOKEN CONSISTENCY**: Providers reporting all three fields must satisfy `total_tokens === prompt_tokens + completion_tokens`. Any arithmetic mismatch invalidates the envelope to `UNAVAILABLE` (`null / null / null`) without silent recalculation.
5. **ZERO REPORTED IS VALID**: An explicitly reported `0 / 0 / 0` by the provider is legitimate and recorded as `source: 'PROVIDER'`.
6. **UNAVAILABLE REPORTING**: If the provider omits usage or reports malformed data, token fields are set to `null` with `source: 'UNAVAILABLE'`. The system **NEVER** fabricates `0` for missing usage.
7. **NOT APPLICABLE FOR UNSUPPORTED**: For requests classified as `UNSUPPORTED_*` or `CONTEXT_BUDGET_EXCEEDED`, no provider calls occur. Tokens are set to `0` with `source: 'NOT_APPLICABLE'`.
8. **TELEMETRY FAIL-OPEN**: Malformed provider token metadata never disrupts the assistant's answer or streaming delivery.
9. **NO PRICING IN 3V**: Phase 3V tracks token counts only. Monetary cost estimation and pricing tables are deferred to future billing governance.
