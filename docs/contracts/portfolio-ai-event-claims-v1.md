# Portfolio AI Event Claims Contract (v1)

Contract: `PORTFOLIO_AI_EVENT_CLAIMS_V1`  
Schema Version: `1`  
Package: `@atlas/ai-engine`  
Phase: `3X`  
Status: `APPROVED`

---

## 1. Overview and Invariants

The **Event Claims Contract** enforces factual citation integrity and deterministic server rendering for generative explanations of portfolio history and individual events.

### Claim Model:

- Event facts are referenced via deterministic IDs:
  - `EVENT:<id>.TYPE`: Transaction/event nature (`BUY`, `SELL`, `DIVIDEND`, `JCP`, `CASH_DEPOSIT`, etc.).
  - `EVENT:<id>.DATE`: Economic execution date (`YYYY-MM-DD`).
  - `EVENT:<id>.ASSET_ID`: Canonical asset identifier.
  - `EVENT:<id>.SYMBOL`: Display ticker symbol.
  - `EVENT:<id>.QUANTITY`: Transacted unit quantity (exact decimal string).
  - `EVENT:<id>.AMOUNT`: Financial transaction/income amount (exact decimal string).
  - `EVENT:<id>.CURRENCY`: Currency code (e.g. `BRL`).
- Summary facts:
  - `TIMELINE:EVENT_COUNT`: Number of events in context.
  - `TIMELINE:HAS_MORE`: Whether event limit was reached.
  - `TIMELINE:PERIOD_START`: Start of the economic range.
  - `TIMELINE:PERIOD_END`: End of the economic range.

### Invariants:

1. **Semantic Distinction**:
   - `BUY` vs `SELL` vs `TRANSFER` vs `DIVIDEND` vs `JCP` vs `CORPORATE_ACTION` must maintain distinct semantics. A transfer cannot be claimed as a purchase; a dividend cannot be claimed as interest on capital (JCP); a split cannot be claimed as a trade.
2. **Server-Rendered Values**:
   - Numeric quantities, dates, and amounts cited in `FACT_VALUE` segments are populated strictly from server-authoritative grounding facts. The model is forbidden from inventing or interpolating numeric event amounts.
3. **Cross-Scope Protection**:
   - When under `ASSET_TIMELINE` scope, citing an event belonging to another asset triggers `CROSS_ASSET_EVIDENCE_PROHIBITED` and fails closed.
4. **Historical Immutability**:
   - Cited event evidence snapshots remain immutable for historical turns. When new events occur, fresh turns cite the new grounding facts deterministically without altering prior message records.
