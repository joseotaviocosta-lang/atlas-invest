# Portfolio AI Provider Projection V1

**Phase:** 3Y — Deterministic Grounding Context Efficiency & Relevance Selection
**Status:** Active
**Module:** `@atlas/ai-engine` → `buildProviderProjection`, `buildCompactConversationPrompt`

---

## 1. Canonical grounding vs provider projection (ADR-223)

Two distinct concepts:

| Concept                                                                                | Role                                                                                                            |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Canonical grounding** (`PortfolioAiGroundingContextV1`, `…AssetAi…`, `…TimelineAi…`) | Rich, authoritative, versioned. Unchanged by Phase 3Y. Source of financial truth and validation.                |
| **Provider projection**                                                                | Compact, request-local, model-facing view of the **selected** canonical facts. Carries no authority of its own. |

The canonical contracts from 3Q/3W/3X are **not** modified. The projection is an
additional, derived representation.

---

## 2. Payload shape

```jsonc
{
  "question": "...",
  "intent": "EXPLAIN_TIMELINE",
  "policyVersion": "1",
  "portfolioId": "...",
  "scope": { "type": "TIMELINE", "from": "2026-01-01", "to": "2026-12-31" },
  "period": { "s": "2026-01-01", "e": "2026-12-31" },
  "asOf": "2026-12-31",
  "currencies": ["BRL"],
  "answerability": "LIMITED",

  "assets": {
    "A1": { "assetId": "asset-petr4", "symbol": "PETR4", "name": "Petróleo Brasileiro S.A." },
  },

  "facts": [
    {
      "ref": "F1", // request-local evidence alias
      "m": "TWR", // metric
      "v": "12", // EXACT decimal string, or null when unavailable
      "u": "PERCENTAGE", // unit
      "s": "BRL", // scope
      "c": "PERFORMANCE", // category
      "n": "OBSERVED", // nature (CURRENT / HISTORICAL / HYPOTHETICAL / …)
      "st": "AVAILABLE", // availability status
      "cur": "BRL", // currency, when present
      "a": "A1", // asset dictionary key, when present
      "p": { "s": "…", "e": "…" }, // period, omitted when degenerate
      "ao": "2026-12-31", // asOf
    },
  ],

  "events": [
    {
      "id": "evt-000049",
      "d": "2026-02-22", // economic date (LocalDate)
      "t": "BUY", // event type — never merged with other types
      "a": "A1",
      "q": "100", // exact quantity string
      "amt": "3752.48", // exact money string
      "cur": "BRL",
      "refs": { "t": "F12", "d": "F13", "q": "F14" },
    },
  ],

  "timeline": { "n": 50, "hasMore": true },
  "dataQuality": { "status": "…", "availability": "…" },
  "limitations": [{ "code": "PARTIAL_TIMELINE_EVENTS", "scope": "TIMELINE", "description": "…" }],
}
```

---

## 3. Compaction rules — all value-preserving

| Rule                            | Description                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asset dictionary (§24)          | Repeated `symbol` / `name` / identity hoisted into `assets`; facts and events reference it by key. `assetId` remains canonical inside the dictionary entry. |
| Event envelope (§25, §26)       | Event metadata carried **once** per event instead of repeated across six atomic fact objects.                                                               |
| Internal metadata omitted (§28) | `source.contract` / `source.path` and validator indexes are never sent to the provider.                                                                     |
| Evidence aliases (§30)          | Long canonical fact IDs replaced by request-local `F<n>` refs.                                                                                              |
| Degenerate period omitted       | `period` dropped only when `startDate === endDate === asOf`, which carries identical information.                                                           |
| Abbreviated keys                | Key names shortened; the system policy addendum documents each abbreviation for the model.                                                                  |

---

## 4. What compaction must never do

- **Never** round, truncate, reformat or re-scale a decimal string. `3.999999999999999999`
  stays exactly that.
- **Never** drop `currency` from a monetary fact.
- **Never** drop `nature` where it distinguishes CURRENT / HISTORICAL / HYPOTHETICAL.
- **Never** drop availability `status`; `null` means unavailable and is never coerced to
  `0` or `"0"`.
- **Never** merge semantically distinct concepts: realized ≠ unrealized,
  `DIVIDEND` ≠ `JCP`, `BUY` ≠ `TRANSFER_IN`, and different currencies are never combined.
- **Never** drop a limitation required for interpretation (`PARTIAL_TIMELINE_EVENTS`,
  `EMPTY_TIMELINE_PERIOD`).
- **Never** remove or weaken a safety directive of the system policy to save bytes.

---

## 5. System policy

The provider system message is:

```
PORTFOLIO_AI_CONVERSATION_POLICY_V1 + COMPACT_CONTEXT_FORMAT_ADDENDUM
```

The canonical policy is preserved **verbatim**. The addendum only explains the compact
structure and the citation rule. All prohibitions (recommendation, prediction,
recalculation, implicit FX, injection resistance) remain intact.

---

## 6. Evidence references and aliases (ADR-224)

- Aliases are **request-local**: `F1`, `F2`, … assigned deterministically in selection
  order. Assignment is stable for identical grounding and collision-free by construction.
- The server mapping `alias → canonical factId` is authoritative.
- The provider returns aliases (or canonical IDs — both are accepted).
- The server resolves references to canonical identity **before** claim validation.
- Unknown references are passed through unchanged so fail-closed validation rejects them.
- **Persistence always uses canonical identity.** Ephemeral aliases are never written to
  the evidence snapshot or the conversation store (§34).

Claim V1 remains unchanged: resolution happens upstream of validation, so no schema
migration is required (§35).

---

## 7. Determinism

Identical `(question, intent, scope, canonical grounding, history)` produces:

- an identical selected fact list;
- an identical alias mapping;
- an identical serialized payload;
- an identical exact byte count.

---

## 8. Measured reduction (deterministic fixtures)

| Case                  | Before (bytes) | After (bytes) | Reduction |
| --------------------- | -------------- | ------------- | --------- |
| portfolio performance | 11,351         | 7,199         | 36.6%     |
| portfolio risk        | 11,329         | 7,584         | 33.1%     |
| asset average cost    | 15,984         | 8,559         | 46.5%     |
| timeline 10 events    | 27,172         | 8,093         | 70.2%     |
| timeline 15 events    | 38,446         | 9,200         | 76.1%     |
| timeline 50 events    | 117,372        | 17,158        | 85.4%     |

Dominant pre-3Y cost was the fact array (≈73% of the payload at 50 events), driven by
per-event fact duplication and repeated metadata.
