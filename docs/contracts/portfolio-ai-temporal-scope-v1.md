# Portfolio AI Temporal Scope Contract (v1)

Contract: `PORTFOLIO_AI_TEMPORAL_SCOPE_V1`  
Schema Version: `1`  
Package: `@atlas/ai-engine`  
Phase: `3X`  
Status: `APPROVED`

---

## 1. Overview and Invariants

The **Temporal Scope Contract** governs time-bounded inquiry and multi-turn conversations scoped to specific economic periods.

### Scope Definitions:

1. **TIMELINE Scope**:

   ```typescript
   export interface TimelineAiScope {
     readonly type: 'TIMELINE';
     readonly from?: string; // YYYY-MM-DD
     readonly to?: string; // YYYY-MM-DD
   }
   ```

   Limits context to portfolio events occurring within the closed economic date interval `[from, to]`.

2. **ASSET_TIMELINE Scope**:
   ```typescript
   export interface AssetTimelineAiScope {
     readonly type: 'ASSET_TIMELINE';
     readonly assetId: string;
     readonly from?: string; // YYYY-MM-DD
     readonly to?: string; // YYYY-MM-DD
     readonly symbol?: string;
     readonly name?: string;
   }
   ```
   Limits context to events for the specific `assetId` within `[from, to]`.

### Invariants:

1. **Per-Message Authority**: Scope is sent and evaluated on every turn. Changing scope immediately switches grounding context with zero stale memory bleed.
2. **Calendar Boundary Constraints**:
   - `from` and `to` must be valid ISO-8601 calendar dates (`YYYY-MM-DD`). Invalid dates (e.g. `2026-02-30`) are rejected immediately with 400 (`PORTFOLIO.INVALID_HISTORY_FILTER`).
   - Invariant `from <= to` must hold; inverted ranges are rejected with 400 (`PORTFOLIO.INVALID_DATE_RANGE`).
   - Maximum allowed window is 366 days (`MAX_TIMELINE_RANGE_DAYS = 366`).
3. **Asset Authorization Guard**:
   - When `ASSET_TIMELINE` is requested, the system verifies that `assetId` has at least one historical event in this portfolio. Tampering or requesting unauthorized asset IDs fails with 404 (`PORTFOLIO.ASSET_NOT_FOUND`).
4. **Display Ticker vs Canonical Identity**:
   - The UI shows formatted civil dates (`DD/MM/YYYY`) and ticker symbols for user convenience.
   - Internally and on API contracts, identity is canonical `AssetId` and economic date is `YYYY-MM-DD`.
