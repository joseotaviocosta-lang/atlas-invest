# Portfolio Asset AI Grounding Contract (v1)

Contract: `PORTFOLIO_ASSET_AI_GROUNDING_CONTEXT_V1`  
Schema Version: `1`  
Package: `@atlas/ai-engine`  
Phase: `3W`  
Status: `APPROVED`

---

## 1. Overview and Purpose

The **Portfolio Asset AI Grounding Context** extends the canonical portfolio grounding boundary to provide scoped, verifiable financial facts for a single asset position in an investor's portfolio.

It enforces strict architectural invariants:

1. **AssetId as Sole Canonical Identity**: Assets are scoped by immutable `AssetId`, never by ticker, symbol, or freeform text.
2. **Authority & No Recalculation**: Grounded asset data originates strictly from canonical portfolio-derived data (`PortfolioReadApi`, `PortfolioReplayEngine`, `PortfolioValuation`). The AI layer performs zero financial recalculation and zero mathematical mutations.
3. **Bounded Asset Context**: The asset context is strictly bounded to $\le 25$ facts and $\le 32,768$ bytes, keeping context independent of portfolio size (10, 100, or 1000 positions).
4. **Exact Decimal Preservation**: Values (`Money`, `Quantity`, `Percentage`) are transported exclusively as exact decimal strings with zero float coercion or IEEE 754 precision loss.
5. **Unknown & Unavailable Semantics**: If cost basis or market price is unavailable, values are strictly `null` with explicit reasons (`UNKNOWN_COST_BASIS`, `PRICE_UNAVAILABLE`), never coerced to zero.
6. **Zero Raw Ledger**: Transaction histories are never provided to LLMs.

---

## 2. Top-Level Schema

```typescript
export interface PortfolioAssetAiGroundingContextV1 extends PortfolioAiGroundingContextV1 {
  readonly scope: AssetAiScope;
  readonly assetFacts: readonly GroundedFinancialFact[];
}

export interface AssetAiScope {
  readonly type: 'ASSET';
  readonly assetId: string;
  readonly symbol?: string;
  readonly name?: string;
}
```

---

## 3. Asset Fact Categories & Metrics

Asset facts are prioritized across 5 canonical categories:

1. `ASSET_IDENTITY`: `ASSET_SYMBOL`, `ASSET_NAME`, `ASSET_TYPE` (`unit: 'TEXT_ENUM'`).
2. `ASSET_POSITION`: `QUANTITY` (`unit: 'QUANTITY'`), `AVERAGE_COST`, `COST_BASIS`, `MARKET_PRICE`, `CURRENT_MARKET_VALUE`, `UNREALIZED_GAIN` (`unit: 'MONEY'`), `UNREALIZED_GAIN_PERCENTAGE` (`unit: 'PERCENTAGE'`).
3. `ASSET_REALIZED`: `REALIZED_GAIN` (`unit: 'MONEY'`).
4. `ASSET_INCOME`: `TOTAL_INCOME`, `DIVIDENDS`, `JCP` (`unit: 'MONEY'`).
5. `ASSET_ALLOCATION`: `PORTFOLIO_PERCENTAGE` (`unit: 'PERCENTAGE'`).
