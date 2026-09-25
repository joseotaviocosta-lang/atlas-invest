# Portfolio AI Explanation API Contract (v1)

Phase: `3R`  
Status: `APPROVED`  
Base Endpoint: `/api/v1/portfolios/:portfolioId/ai/explain`  
Response Contract: `PORTFOLIO_AI_EXPLANATION_V1` (`schemaVersion: "1"`)

---

## 1. Endpoint Overview

Performs a single-turn, evidence-grounded AI explanation of portfolio facts, historical performance, benchmarks, historical risk, deterministic scenarios, or data quality.

- **Method**: `POST`
- **Path**: `/api/v1/portfolios/:portfolioId/ai/explain`
- **Authentication**: `Bearer <accessToken>` (`JwtAuthGuard`)
- **Status Code**: `200 OK` for both `ANSWERED` and `UNSUPPORTED` outcomes (refusals are domain responses, not HTTP errors).
- **Rate Limit**: `@Throttle({ default: { limit: 20, ttl: 60000 } })` (20 requests per minute; stricter than ordinary portfolio reads).
- **Isolation Policy**: Anti-enumeration hidden `404 Not Found` for nonexistent or unowned portfolios (never `403`).
- **Provider Budget**:
  - Unsupported intent: **0 grounding calls**, **0 AI model calls**.
  - Supported intent: **1 grounding call** (via `GetPortfolioAiGroundingContextUseCase`), **at most 1 AI model call**.
  - No additional portfolio replay, timeline pass, valuation, market-price, IBOV, CDI, or scenario execution beyond the grounding pipeline.
- **Server-Only Secrets**: AI provider keys (`OPENAI_API_KEY`, etc.) reside strictly on the server (`apps/api` infrastructure) and are never exposed to web/mobile clients.
- **Zero Client Calculation**: The client receives server-resolved evidence. Zero arithmetic is performed on the frontend (formatting only via `@atlas/ui`).
- **Stateless**: No `conversationId`, no `messages[]`, no chat history, no persistence, no cache. One request → one answer.

---

## 2. Request Body

```json
{
  "question": "Como foi o desempenho da minha carteira no período?",
  "startDate": "2025-09-22",
  "endDate": "2026-09-22"
}
```

### Validation Rules (`ExplainPortfolioBodySchema`)

| Field       | Type   | Required | Constraints                                                                                 |
| :---------- | :----- | :------- | :------------------------------------------------------------------------------------------ |
| `question`  | string | Yes      | Min length: 3, Max length: 2000. Trimmed user data; never treated as system instructions.   |
| `startDate` | string | No       | Civil date `YYYY-MM-DD` (strict regex). Optional; forwarded to grounding pipeline when set. |
| `endDate`   | string | No       | Civil date `YYYY-MM-DD` (strict regex). Optional; forwarded to grounding pipeline when set. |

`portfolioId` is a UUID path param (`UUIDParamPipe`). `userId` comes exclusively from `@CurrentPrincipal()` (never from client payload).

---

## 3. Response Structure (`200 OK`)

Envelope: `{ "data": GroundedAiExplanationResponseV1 }`.

### A. Supported Intent — Answered (`ANSWERED`)

```json
{
  "data": {
    "schemaVersion": "1",
    "status": "ANSWERED",
    "intent": "EXPLAIN_PERFORMANCE",
    "answer": "No período, o TWR da carteira em BRL foi X e o retorno do Ibovespa foi Y, diferença Z p.p. Valores históricos, não previsões.",
    "evidence": [
      {
        "factId": "BRL.PERFORMANCE.TWR",
        "category": "PERFORMANCE",
        "metric": "TWR",
        "scope": "BRL",
        "value": "12",
        "unit": "PERCENTAGE",
        "nature": "PERIOD",
        "status": "AVAILABLE"
      }
    ],
    "limitations": ["Rentabilidade passada não garante rentabilidade futura."],
    "model": { "provider": "openai", "model": "gpt-4o-mini" }
  }
}
```

- `evidence[]` are server-resolved `ResolvedEvidenceFact` objects (values from grounding, never from model prose).
- `model.provider` / `model.model` come from server config (`AI_PROVIDER`, `AI_MODEL`); no provider internals or secrets exposed.

### B. Unsupported Intent — Refusal (`UNSUPPORTED`)

```json
{
  "data": {
    "schemaVersion": "1",
    "status": "UNSUPPORTED",
    "intent": "UNSUPPORTED_RECOMMENDATION",
    "reason": "RECOMMENDATION_NOT_SUPPORTED",
    "answer": "O Atlas pode explicar os dados da sua carteira, mas esta versão não recomenda compras, vendas ou rebalanceamentos.",
    "evidence": [],
    "limitations": []
  }
}
```

Refusal messages (`INTENT_REFUSAL_MESSAGES`, pt-BR):

- `UNSUPPORTED_RECOMMENDATION`: "O Atlas pode explicar os dados da sua carteira, mas esta versão não recomenda compras, vendas ou rebalanceamentos."
- `UNSUPPORTED_PREDICTION`: "O Atlas analisa exclusivamente dados e rentabilidade históricos; não realizamos previsões de mercado ou projeções de retorno futuro."
- `UNSUPPORTED_NEW_CALCULATION`: "O Atlas explica métricas pré-computadas pelo motor analítico; não realiza novos cálculos manuais ou métricas fora dos períodos canônicos."
- `UNSUPPORTED_TAX`: "O Atlas não fornece consultoria tributária ou cálculos de impostos neste módulo. Consulte a aba Fiscal para informações tributárias."
- `UNSUPPORTED_OTHER`: "Esta pergunta não é suportada pelo assistente de explicações factuais do Atlas."

---

## 4. Error Responses

- `400 Bad Request` (`VALIDATION.INVALID_INPUT` via `ZodValidationPipe`): question < 3 or > 2000 chars, invalid `startDate`/`endDate` format, invalid UUID.
- `401 Unauthorized`: missing or invalid JWT access token.
- `404 Not Found`: portfolio does not exist or belongs to another user (anti-enumeration invariant).
- `422 Unprocessable Entity` (`AI.INVALID_MODEL_RESPONSE`): model returned malformed JSON, schema violation, empty answer, unknown/hallucinated `factId`, or zero verified evidence.
- `429 Too Many Requests`: AI endpoint rate limit exceeded (`AI.PROVIDER_RATE_LIMIT` for upstream 429).
- `503 Service Unavailable` (`AI.PROVIDER_UNAVAILABLE` / `AI.PROVIDER_NOT_CONFIGURED`): provider timeout, 5xx, network failure, or missing `OPENAI_API_KEY`. Never reported as "financial data unavailable".
- `504 Gateway Timeout` (`AI.PROVIDER_TIMEOUT`): provider request exceeded explicit timeout (15s).
- `502 Bad Gateway` (`AI.PROVIDER_ERROR`): non-429/5xx upstream error.

Provider outage never implies portfolio-ledger corruption. Stack traces are never exposed.
