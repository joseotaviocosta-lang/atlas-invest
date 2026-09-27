# Portfolio AI Context Budget V1

**Phase:** 3Y (budget itself frozen since 3V/ADR-207, enforcement hardened in 3X)
**Status:** Active
**Modules:** `@atlas/ai-engine` → `validateContextBudget`, `classifyBudgetUtilization`;
`apps/api` → `apps/api/src/application/ai/context-budget.ts`

---

## 1. The limit

```
AI_DEFAULT_MAX_CONTEXT_BYTES = 32768
```

This value is **frozen**. Phase 3Y improves efficiency, never the budget. It is not
raised to 64 KB, not raised to 128 KB, not replaced by a provider model-context size,
and not approximated by token counts. The budget is measured in **bytes**, never tokens.

Environment override `AI_MAX_CONTEXT_BYTES` exists for operational containment only; a
malformed or negative value falls back to the frozen default.

---

## 2. Boundary semantics

| Measured size | Decision |
| ------------- | -------- |
| `<= 32768`    | allowed  |
| `> 32768`     | blocked  |

Concretely: **32768 bytes is allowed; 32769 bytes is blocked.**

---

## 3. What is measured

The measured object is exactly the `AIMessage[]` array handed to
`AIProvider.complete`:

```ts
Buffer.byteLength(JSON.stringify(messages), 'utf8');
```

This covers the complete request boundary:

- the system policy (canonical policy + compact format addendum);
- every bounded conversation history message;
- the user turn (question + provider projection: selected facts, asset dictionary,
  event envelope, limitations).

UTF-8 is mandatory. Accented Portuguese text (`ação`, `posição`, `São Paulo`) consumes
more bytes than characters, and the measurement reflects that.

Earlier bounds — `MAX_AI_TIMELINE_EVENTS = 50`, bounded history (10 messages /
14,000 chars), deterministic fact selection — are **upstream bounds, not the gate**.
`groundingSerializedBytes` is observational telemetry only and is never a gate.

---

## 4. Decision order (ADR-225)

```
canonical grounding
  → deterministic relevance selection
  → compaction / provider projection
  → final provider messages
  → exact UTF-8 byte measurement
  → budget decision
  → provider call (only if allowed)
```

The measurement happens **after** compaction and **before** the provider call. There is
exactly one authoritative decision per request, shared by all three provider call sites
(`/ai/explain`, conversation send, conversation stream).

---

## 5. Over-budget behaviour — fail closed

| Property                                | Value                              |
| --------------------------------------- | ---------------------------------- |
| provider calls                          | **0**                              |
| error code                              | `AI.CONTEXT_BUDGET_EXCEEDED`       |
| HTTP status (sync)                      | `400`                              |
| Stream                                  | terminal `ERROR` event, no `FINAL` |
| successful assistant answer persisted   | **no**                             |
| retry / repair / judge / fallback model | **none**                           |

No silent truncation of provider messages, no dropped system policy, no dropped
grounding, no dropped required limitation. If deterministic bounded selection still
exceeds the budget, the request fails closed — this is an accepted outcome, not a bug.

Supported requests make at most **1** provider call. Selection itself costs **0**
provider calls.

---

## 6. Utilization buckets (observability)

`classifyBudgetUtilization(sizeBytes, maxBytes)` returns a bounded, low-cardinality
label:

```
LT_25 | 25_50 | 50_75 | 75_90 | 90_100 | OVER
```

Metric labels may carry `budgetUtilizationBucket`, `selectionPolicyVersion`,
`operation`, `deliveryMode`, `intent`, `status`, `provider`, `model`, `errorCode`,
`scopeType`.

Metric labels must **never** carry raw byte counts, fact IDs, `assetId`, `portfolioId`,
`conversationId`, `userId` or `requestId`. Numeric counts
(`availableFactCount`, `selectedFactCount`, `contextBytes`) live in structured telemetry
counts, not in metric dimensions.

Telemetry never records question text, answer text or any financial value, and telemetry
failure is fail-open: it never breaks a valid AI response.
