# Phase 5T — Market Intelligence Expansion

## Executive Summary

Phase 5T expands the Project Atlas **Market** surface (`/market` and `/market/assets/[assetId]`) to enable discovery, watchlist tracking, and factual understanding of assets beyond existing investor custody.

The implementation honors all core architectural and financial invariants:
- **Zero float math:** canonical decimal strings and typed domain abstractions.
- **Strict multi-currency segregation:** explicit native currency labels (`BRL`, `USD`), zero implicit FX conversions, and zero summing across currencies.
- **Source of Truth compliance:** transaction ledger remains the sole source of truth; custody status (`isHeld`) is strictly derived on demand via `replayPortfolio`.
- **Honest disclosure (zero hallucinated data):** fundamentals and corporate news for which live external providers are not yet integrated are honestly disclosed as `MARKET_DATA_PROVIDER_GAP` / `UNAVAILABLE` rather than fabricating figures.
- **Tenant isolation:** user-scoped watchlist; unauthorized cross-user modifications fail with `404 Not Found` (anti-enumeration).
- **Minimal database migration delta:** exactly 1 minimal migration (`43 -> 44`, delta `+1`).

---

## 1. Roadmap Numbering Conflict Resolution

Auditing Git history revealed that commit `21150eb` previously claimed Phase 5K for the *Portfolio Import Hub*. To eliminate any ambiguity or overwriting in the historical lineage, the owner formally resolved the identifier:
- **Old Identifier:** `5K` (Cancelled due to historical collision)
- **New Canonical Identifier:** `5T`
- **Phase Name:** `MARKET INTELLIGENCE EXPANSION`
- **Linear Status:** `PASS_5T_EXPANSION`

---

## 2. Database & Persistence Layer (`delta = +1`)

### Migration: `20261028120000_add_watchlist_items`
- **Baseline Migration Count:** 43
- **Post-Phase Migration Count:** 44
- **Delta:** `+1`

```sql
-- Phase 5T — Investor Asset Watchlist.
-- User-scoped watchlist for asset tracking and market intelligence discovery.

CREATE TABLE "watchlist_items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "watchlist_items_user_asset_uniq" ON "watchlist_items"("user_id", "asset_id");
CREATE INDEX "watchlist_items_user_idx" ON "watchlist_items"("user_id");
CREATE INDEX "watchlist_items_asset_idx" ON "watchlist_items"("asset_id");

ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### Repository Implementation
- `IWatchlistRepository` / `WatchlistRepository` in `packages/database`:
  - `add(userId, assetId)`: idempotent upsert via `(userId, assetId)` compound key.
  - `remove(userId, assetId)`: removes user watchlist link.
  - `listByUser(userId)`: returns all watched assets for the authenticated principal.
  - `isWatched(userId, assetId)`: checks watch presence.
  - `findByUserAndAsset(userId, assetId)`: single item lookup.

---

## 3. HTTP API Endpoints

### 1. `GET /api/v1/watchlist`
- Authenticated via JWT (`@CurrentPrincipal()`).
- Retrieves user's watchlist items.
- Batch-fetches latest quotes using `IMarketQuoteRepository.findLatestByAssets(assetIds)`.
- Classifies quote freshness via canonical `classifyEodQuoteFreshness` (`FRESH`, `STALE`, `UNVALUED`).
- Returns `{ data: WatchlistItemDto[] }`.

### 2. `POST /api/v1/watchlist`
- Accepts `{ assetId: string }` validated with Zod UUID schema.
- Rejects non-existent assets with `404 Not Found` (`COMMON.NOT_FOUND`).
- Idempotent: repeated requests for the same asset succeed safely without duplicate rows.

### 3. `DELETE /api/v1/watchlist/:assetId`
- Removes asset from user watchlist.
- Strict tenant isolation: returns `404 Not Found` if the asset is not in the caller's watchlist (anti-enumeration).

### 4. `GET /api/v1/market/assets/:assetId`
- Returns comprehensive market detail for an asset:
  - Ticker, name, exchange, type, native currency.
  - Latest quote, trading date, source/provider, freshness.
  - `isWatched`: boolean.
  - `isHeld`: boolean, derived via `replayPortfolio` across the user's portfolios.
  - `heldInPortfolios`: list of portfolios holding custody.
  - `fundamentals`: status `UNAVAILABLE` (`MARKET_DATA_PROVIDER_GAP`).
  - `news`: status `UNAVAILABLE` (`MARKET_DATA_PROVIDER_GAP`).

---

## 4. Web Surface & Design System Architecture

### 1. `/market` Page (`apps/web/src/app/(app)/market/page.tsx`)
- **Asset Discovery:** Real-time search against the asset catalog (`/api/v1/assets?q=...`), rendering results with Ticker, Name, Type, Exchange, Currency, direct link to Market Asset Detail, and quick-add button to Watchlist.
- **Watchlist Section:** Displays all watched assets with quote, provider, date, and status. Provides explicit multi-currency segregation (currency pills for `ALL`, `BRL`, and `USD`), with a clear disclaimer: *"Cotações expressas na moeda nativa de cada ativo. Sem conversão cambial implícita."*
- **Empty State:** Friendly guidance when the watchlist is empty.
- **Portfolio Custody Section:** Preserves existing portfolio valuation coverage table.
- **Macro Indicators:** Preserves Bacen / B3 indicator cards.

### 2. `/market/assets/[assetId]` Page (`apps/web/src/app/(app)/market/assets/[assetId]/page.tsx`)
- **Strict Separation of Concerns:**
  - `/portfolio/assets/[assetId]` = custody position, average cost, cost basis, lots, operations, realized gains.
  - `/market/assets/[assetId]` = market quote, freshness, currency, exchange, type, watchlist toggle.
- **Cross-link to Custody:** If `isHeld === true`, provides a direct navigation link: *"Você possui este ativo na sua custódia ({carteiras}). Ver posição na Carteira →"*.
- **Honest Provider Disclosures:** Prominently clarifies that corporate financial metrics and live news feeds require an external provider connector (`MARKET_DATA_PROVIDER_GAP`), rejecting fake data.

---

## 5. Verification & Quality Gates

| Gate | Target | Result | Status |
| :--- | :--- | :--- | :--- |
| **Migrations** | `before = 43, after = 44, delta = +1` | 44 total | **PASS** |
| **API Tests** | `tests/api/watchlist-and-market.test.ts` | 11/11 passed | **PASS** |
| **Web Tests** | `pnpm test:web` | 76 files, 534/534 passed | **PASS** |
| **Tax Engine Tests** | `pnpm test:tax-engine` | 78 files, 813/813 passed | **PASS** |
| **Workspace Typecheck** | `pnpm typecheck` | 25/25 packages successful | **PASS** |
| **Lint** | `pnpm lint` | 0 errors | **PASS** |
| **Formatting** | `prettier` | Formatted cleanly | **PASS** |
| **API Build** | `pnpm --filter @atlas/api build` | Exit code 0 | **PASS** |
| **Web Build** | `pnpm --filter @atlas/web build` | 33/33 static pages generated | **PASS** |
| **Push Rule** | `NO PUSH` | Not pushed | **PASS** |
