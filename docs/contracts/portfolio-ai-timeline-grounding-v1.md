# Portfolio AI Timeline Grounding Contract (v1)

Contract: `PORTFOLIO_AI_TIMELINE_GROUNDING_CONTEXT_V1`  
Schema Version: `1.0`  
Package: `@atlas/ai-engine`  
Phase: `3X`  
Status: `APPROVED`

---

## 1. Overview and Purpose

The **Portfolio AI Timeline Grounding Context** provides bounded, immutable, deterministic event facts derived from canonical portfolio history for temporal Q&A without exposing raw ledger transactions to language models.

### Strict Invariants:

1. **Canonical History Authority**: Event facts originate strictly from canonical history projections (`PortfolioReadApi`, `PortfolioReplayEngine`, `PortfolioReadModelMapper`). The AI layer performs zero financial recalculation, zero reinterpretation of ledger semantics, and zero mathematical aggregation.
2. **No Raw Ledger Exposed**: Raw database transaction rows, Prisma models, and unprojected internal fields never reach the provider.
3. **Bounded Context Budget**:
   - $\le 50$ events maximum (`MAX_AI_TIMELINE_EVENTS = 50`).
   - $\le 366$ days economic date range (`MAX_TIMELINE_RANGE_DAYS = 366`).
   - Context serialized byte size strictly complies with budget limitations.
4. **Deterministic Selection**:
   - Ingestion: candidate events filtered by economic date `[from, to]` and assetId (if `ASSET_TIMELINE`).
   - Sorting: `economicDate DESC, eventId DESC` for selection, chronological `economicDate ASC, eventId ASC` for prompt context.
   - Truncation Disclosure: If matching events exceed 50, `summaryFacts.hasMore: true` and limitation `PARTIAL_TIMELINE_EVENTS` are explicitly disclosed.
5. **Exact Decimal Preservation**: Quantities and monetary amounts are transported exclusively as exact decimal strings. No IEEE 754 float precision loss.
6. **Economic Date Primacy**: All filtering and ordering is conducted by economic `tradeDate` (`LocalDate`, `YYYY-MM-DD`). Technical timestamps (`createdAt`) are never used as financial event dates.

---

## 2. Schema Structure

```typescript
export interface PortfolioTimelineAiGroundingContextV1 {
  readonly schemaVersion: '1.0' | '1';
  readonly portfolioId: string;
  readonly period: {
    readonly from: string; // YYYY-MM-DD
    readonly to: string;   // YYYY-MM-DD
  };
  readonly filters: {
    readonly scopeType: 'TIMELINE' | 'ASSET_TIMELINE';
    readonly assetId?: string;
    readonly symbol?: string;
  };
  readonly summaryFacts: {
    readonly eventCountIncluded: number;
    readonly hasMore: boolean;
    readonly totalMatchingEvents?: number;
    readonly periodStart: string;
    readonly periodEnd: string;
  };
  readonly events: readonly PortfolioAiEventV1[];
  readonly facts: readonly GroundedFinancialFact[];
  readonly scope: TimelineAiScope | AssetTimelineAiScope;
  readonly limitations: readonly GroundedLimitation[];
  readonly capabilities: {
    readonly canExplainTimelineEvents: true;
  };
  readonly eventLimitReached?: boolean;
}
```

