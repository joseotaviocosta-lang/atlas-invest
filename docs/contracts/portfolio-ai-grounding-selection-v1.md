# Portfolio AI Grounding Selection V1

**Phase:** 3Y — Deterministic Grounding Context Efficiency & Relevance Selection
**Status:** Active
**Policy version:** `GROUNDING_SELECTION_POLICY_VERSION = "1"`
**Module:** `@atlas/ai-engine` → `selectGroundingFacts`

---

## 1. Purpose

Select, **deterministically and before any provider call**, the subset of canonical
grounding facts that the active turn actually requires. Selection improves context
efficiency without weakening financial authority.

Selection is **not** summarization. No language model, embedding, vector store or
second model call participates (ADR-226).

---

## 2. Allowed inputs

Selection reads **only**:

| Input                 | Source                                                                         |
| --------------------- | ------------------------------------------------------------------------------ |
| `intent`              | deterministic classifier (`classifyConversationIntent`)                        |
| `scope.type`          | explicit request scope (`PORTFOLIO` / `ASSET` / `TIMELINE` / `ASSET_TIMELINE`) |
| `scope.assetId`       | explicit canonical `AssetId`                                                   |
| `context.facts`       | canonical grounding already built                                              |
| `context.limitations` | canonical limitations                                                          |

Explicitly **forbidden** inputs:

- provider output of any kind;
- numeric magnitude of any financial value (§22, §100);
- free-text parsing of values via regex;
- embeddings or similarity scores.

---

## 3. Intent → fact family map (ADR-222)

`OVERVIEW` is always required as the interpretive frame.

| Intent                 | Selected families                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `EXPLAIN_PORTFOLIO`    | OVERVIEW, PERFORMANCE, BENCHMARK, ASSET_ALLOCATION                                       |
| `EXPLAIN_PERFORMANCE`  | OVERVIEW, PERFORMANCE, BENCHMARK, ACTIVE_PERFORMANCE                                     |
| `EXPLAIN_BENCHMARK`    | OVERVIEW, PERFORMANCE, BENCHMARK, RELATIVE_RISK, ACTIVE_PERFORMANCE                      |
| `EXPLAIN_RISK`         | OVERVIEW, RISK, RISK_ADJUSTED, RELATIVE_RISK, TAIL_RISK                                  |
| `EXPLAIN_SCENARIO`     | OVERVIEW, SCENARIO                                                                       |
| `EXPLAIN_DATA_QUALITY` | OVERVIEW                                                                                 |
| `EXPLAIN_ASSET`        | OVERVIEW, ASSET_IDENTITY, ASSET_POSITION, ASSET_INCOME, ASSET_REALIZED, ASSET_ALLOCATION |
| `EXPLAIN_TIMELINE`     | OVERVIEW, TIMELINE_EVENT, EVENT_TRANSACTION, EVENT_INCOME, EVENT_CORPORATE_ACTION        |

Unsupported intents (`UNSUPPORTED_RECOMMENDATION`, `UNSUPPORTED_PREDICTION`,
`UNSUPPORTED_NEW_CALCULATION`, `UNSUPPORTED_TAX`, `UNSUPPORTED_OTHER`) never reach
selection: the upstream gate already returns with **0 grounding calls and 0 provider
calls**.

---

## 4. Scope isolation

When `scope.type` is `ASSET` or `ASSET_TIMELINE`, a fact whose `assetId` differs from
`scope.assetId` is **never selected**. This preserves the Phase 3W cross-asset
prohibition at the selection layer, in addition to the existing claim-validation check.

`AssetId` remains the canonical identity; `symbol` and `name` remain display metadata.

---

## 5. Ordering and deduplication

- Selected facts preserve **canonical input order** (stable, no re-sorting).
- Duplicate `factId` values are collapsed to the first occurrence.
- Identical inputs always produce an identical selected list and identical serialized
  bytes (verified over 1000 repetitions).

Complexity is a single `O(n)` pass over available facts using `Set`/`Map` membership.

---

## 6. Fallback (§79, §80)

If `intent` is not present in the family map, selection sets `usedFallback = true` and
selects the **broad safe bounded subset** (all canonical categories). The policy prefers
a broader safe subset over aggressive guessing. It never returns an arbitrary partial set.

---

## 7. Selection manifest

Every request produces a `GroundingSelectionManifestV1`:

```
policyVersion        "1"
intent               deterministic intent
scopeType            PORTFOLIO | ASSET | TIMELINE | ASSET_TIMELINE
availableFactCount   canonical facts offered
selectedFactCount    facts selected for this turn
excludedFactCount    availableFactCount - selectedFactCount
selectedCategories   sorted category list
excludedCategories   sorted category list
usedFallback         boolean
answerability        ANSWERABLE | LIMITED | UNAVAILABLE
```

Invariant: `availableFactCount === selectedFactCount + excludedFactCount`.

The manifest carries **no financial values** and is safe for observability.

---

## 8. Authority boundary (ADR-227)

`canonicalFactRegistry` contains **only the selected facts**. It is the sole
authoritative registry for the turn:

- evidence citations are validated against it;
- claims are validated against it;
- a fact excluded from selection **cannot** support an authoritative claim, and any
  attempt to cite it fails closed with `AI.INVALID_MODEL_RESPONSE` (422).

Selection is finalized before the provider call and is never revised afterwards.

---

## 9. Answerability

`answerability` is reported so the server never silently proceeds with empty grounding:

| Value         | Meaning                                 |
| ------------- | --------------------------------------- |
| `ANSWERABLE`  | selected facts exist, no limitations    |
| `LIMITED`     | selected facts exist, limitations apply |
| `UNAVAILABLE` | no selected authoritative facts         |

---

## 10. Anti-scope

No RAG, no embeddings, no vector database, no agents, no tool calling, no web access,
no second model call, no LLM summarization, no recommendations, no predictions, no tax
logic, and no new financial computation.
