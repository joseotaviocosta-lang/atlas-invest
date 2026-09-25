# Portfolio AI Explanation Contract (v1)

Contract: `PORTFOLIO_AI_EXPLANATION_V1`  
Schema Version: `1`  
Policy Version: `1` (`PORTFOLIO_AI_EXPLANATION_POLICY_V1`)  
Grounding Schema: `PortfolioAiGroundingContextV1` (`GROUNDING_SCHEMA_VERSION = '1'`)  
Package: `@atlas/ai-engine`  
Phase: `3R`  
Status: `APPROVED`

---

## 1. Overview and Purpose

The **Portfolio AI Explanation Contract** defines the bounded, evidence-grounded AI explanation domain model for Project Atlas.

It ensures that:

1. **Evidence-Bound Answers**: Explanations can only be generated from facts explicitly provided in `PortfolioAiGroundingContextV1` (Phase 3Q). The model cannot assert metrics, values, or historical claims outside the grounding context.
2. **Deterministic Intent Gate**: User queries are deterministically classified via `classifyExplanationIntent(question)` before any grounding or model invocation. Requests for buy/sell recommendations, market predictions, novel calculations, or tax advice are refused immediately with 0 grounding calls and 0 model calls.
3. **Structured Citations**: Every portfolio-specific financial claim is grounded in specific, verifiable fact IDs from the grounding context (e.g. `BRL.PERFORMANCE.TWR`, `BRL.BENCHMARK.IBOV.RETURN`).
4. **Fail-Closed Evidence Validation**: `validateExplanationEvidence(evidenceFactIds, context)` rejects unknown fact IDs (`AI.INVALID_MODEL_RESPONSE`) and rejects empty evidence for supported intents. Evidence values returned to clients are resolved strictly from grounding, never from model prose.
5. **Zero Financial Recalculation**: The AI Engine and AI Explanation use case never calculate returns, averages, risk metrics, or conversions. No `Math.*`, `parseFloat`, or `Number()` on financial paths.
6. **No Multi-Currency Mixing**: Segregated currency contexts (`BRL`, `USD`) are preserved. No implicit FX cross-currency arithmetic is permitted.
7. **No Conversation Persistence**: Transient single-turn explanation. No chat history tables, no session memory, no vector DB / RAG, no embeddings, no agents, no tool calls, no web search.

> Residual risk note (ADR-179): evidence validation guarantees cited-evidence validity, not perfect semantic truth of every free-form token. The model answer is prose; canonical evidence objects are the authoritative values.

---

## 2. Canonical Response Type (`GroundedAiExplanationResponseV1`)

```typescript
export const EXPLANATION_SCHEMA_VERSION = '1' as const;
export const EXPLANATION_POLICY_VERSION = '1' as const;

export type ExplanationIntent =
  | 'EXPLAIN_PORTFOLIO'
  | 'EXPLAIN_PERFORMANCE'
  | 'EXPLAIN_BENCHMARK'
  | 'EXPLAIN_RISK'
  | 'EXPLAIN_SCENARIO'
  | 'EXPLAIN_DATA_QUALITY'
  | 'UNSUPPORTED_RECOMMENDATION'
  | 'UNSUPPORTED_PREDICTION'
  | 'UNSUPPORTED_NEW_CALCULATION'
  | 'UNSUPPORTED_TAX'
  | 'UNSUPPORTED_OTHER';

export interface ResolvedEvidenceFact {
  factId: string;
  category: GroundedFactCategory;
  metric: string;
  scope: string;
  value: string | null;
  unit: GroundedFactUnit;
  period?: { readonly startDate: string; readonly endDate: string };
  asOf?: string;
  nature: GroundedFactNature;
  status: GroundedFactStatus;
}

export interface GroundedAiExplanationResponseV1 {
  schemaVersion: '1';
  status: 'ANSWERED' | 'UNSUPPORTED' | 'UNAVAILABLE';
  intent: ExplanationIntent;
  reason?: string;
  answer: string;
  evidence: ResolvedEvidenceFact[];
  limitations: string[];
  model?: {
    provider: string;
    model: string;
    requestId?: string;
  };
}
```

Status semantics:

- `ANSWERED`: supported intent, exactly 1 grounding call + at most 1 model call, evidence validated.
- `UNSUPPORTED`: deterministic upstream refusal (recommendation / prediction / new calculation / tax / other). 0 grounding calls, 0 model calls. Returned with HTTP `200 OK`.
- `UNAVAILABLE`: reserved for future financial-data-unavailable states. Provider/system errors use canonical HTTP/API errors (`AI.PROVIDER_UNAVAILABLE`, `AI.INVALID_MODEL_RESPONSE`), never masquerade as `UNAVAILABLE`.

---

## 3. Explanation Intents and Gate (ADR-181)

```typescript
export const EXPLANATION_INTENTS = [
  'EXPLAIN_PORTFOLIO',
  'EXPLAIN_PERFORMANCE',
  'EXPLAIN_BENCHMARK',
  'EXPLAIN_RISK',
  'EXPLAIN_SCENARIO',
  'EXPLAIN_DATA_QUALITY',
  'UNSUPPORTED_RECOMMENDATION',
  'UNSUPPORTED_PREDICTION',
  'UNSUPPORTED_NEW_CALCULATION',
  'UNSUPPORTED_TAX',
  'UNSUPPORTED_OTHER',
] as const;
```

Supported intents (1 grounding call + at most 1 model call):

- `EXPLAIN_PORTFOLIO`: general factual overview ("Me explique minha carteira.").
- `EXPLAIN_PERFORMANCE`: historical TWR/XIRR ("Como foi o desempenho da minha carteira no período?").
- `EXPLAIN_BENCHMARK`: IBOV/CDI comparison ("Como minha carteira se compara ao Ibovespa?").
- `EXPLAIN_RISK`: volatility, drawdown, Sharpe, Sortino, VaR/CVaR ("Explique o risco histórico da minha carteira.").
- `EXPLAIN_SCENARIO`: deterministic stress output ("O que significa o cenário de queda de 10%?").
- `EXPLAIN_DATA_QUALITY`: completeness and limitations ("Os dados da minha carteira estão completos?").

Refused / Unsupported intents (0 grounding calls, 0 model calls, HTTP `200` + `status: "UNSUPPORTED"`):

- `UNSUPPORTED_RECOMMENDATION` (`RECOMMENDATION_NOT_SUPPORTED`): "Qual ação devo comprar?", "Devo vender?", "Como rebalancear?", best/worst asset, target allocation.
- `UNSUPPORTED_PREDICTION` (`PREDICTION_NOT_SUPPORTED`): "Quanto vai render no próximo ano?", "vai subir?", price targets, forecasts.
- `UNSUPPORTED_NEW_CALCULATION` (`NEW_CALCULATION_NOT_SUPPORTED`): "Calcule meu Sharpe dos últimos 17 dias.", custom periods/metrics absent from grounding.
- `UNSUPPORTED_TAX` (`TAX_ADVICE_NOT_SUPPORTED`): "Quanto imposto devo pagar?", DARF advice.
- `UNSUPPORTED_OTHER` (`PROMPT_INJECTION_DETECTED` | `UNRECOGNIZED_INTENT`): injection/escape attempts, system-prompt extraction, off-topic queries. Ambiguous queries default here (conservative).

Classifier is deterministic (normalization + regex rules), no model call, and runs before grounding.

---

## 4. Evidence Verification Rule (ADR-182)

```typescript
export function validateExplanationEvidence(
  evidenceFactIds: string[],
  context: PortfolioAiGroundingContextV1,
): {
  valid: boolean;
  resolvedEvidence: ResolvedEvidenceFact[];
  unknownFactIds: string[];
};
```

1. Each `factId` in `evidenceFactIds` is looked up in `context.facts`.
2. Any `factId` not found marks the whole response invalid (`valid: false`, `unknownFactIds` non-empty) → `422 AI.INVALID_MODEL_RESPONSE`. Unknown IDs are never silently dropped for supported answers.
3. Duplicates are deduplicated; output order is canonical grounding order (`context.facts` index order).
4. Empty `resolvedEvidence` for a supported intent fails closed → `422 AI.INVALID_MODEL_RESPONSE` ("lacks verified financial evidence citations").
5. Evidence values in the API response come strictly from grounding. Model-supplied numbers in prose are not trusted.
6. Client view models (`PortfolioAiExplanationViewModel`) receive server-resolved `ResolvedEvidenceFact` objects with labels, formatted values, units, and nature badges (`Histórico` for `HISTORICAL`, `Hipótese` for `HYPOTHETICAL`).

---

## 5. Model Request Boundary (ADR-179, ADR-183, ADR-185)

`buildExplanationPrompt(context, question, intent)` returns `{ system, user }`:

- `system` is exactly `PORTFOLIO_AI_EXPLANATION_POLICY_V1` (version `1`, snapshotted in unit tests).
- `user` is JSON `{ question, intent, groundingContext }` where `groundingContext` contains only `portfolioId`, `analysisPeriod`, `asOf`, `currencies`, `facts[]` (factId/category/metric/scope/value/unit/period/asOf/nature/status), `dataQuality { status, availability }`, and `limitations[]`.
- Never included: raw `Transaction[]`/ledger, Prisma models, market-provider internals, passwords/hashes, JWT/refresh tokens, authorization headers, email/CPF, account secrets.
- The user question itself and the grounded financial facts are sent to the provider (documented privacy boundary).
- Provider adapter performs the only network I/O, with `temperature: 0.1`, `response_format: { type: 'json_object' }`, explicit timeout (15s), no tools, no web search, single model call maximum.

Model must return strict JSON:

```json
{
  "answer": "Texto explicativo claro, conciso e factual em pt-BR.",
  "evidenceFactIds": ["BRL.PERFORMANCE.TWR"],
  "limitations": ["..."]
}
```

Validated with Zod (`answer` non-empty, `evidenceFactIds: string[]`, `limitations: string[]`). Malformed/empty/hallucinated output → `422 AI.INVALID_MODEL_RESPONSE`. Transport failures → `503 AI.PROVIDER_UNAVAILABLE` / `429` / `504` per failure model (never "financial data unavailable").
