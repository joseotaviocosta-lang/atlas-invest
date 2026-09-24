# ADR-161 — Equity Price Shock Methodology

**Status:** Accepted — 2026-09-23 (Fase 3O)
**Context:** A direct equity price shock applies a deterministic percentage move
to eligible holdings' market value.

**Decision:**

- Eligible asset classes (canonical domain names): **STOCK, FII, ETF, BDR**.
  Ineligible classes (FIXED_INCOME, TREASURY, FUND, CASH) are left unchanged.
- Formula (exact decimal):
  `stressedPrice = basePrice × (1 + shock/100)`;
  `stressedMarketValue = quantity × stressedPrice`;
  `absoluteImpact = stressedValue − baseValue`;
  `percentageImpact = absoluteImpact / baseValue × 100`.
- Only **valued** eligible positions are stressed; unvalued positions are
  excluded and reported (ADR-165).
- Bounds: shock ∈ **[−100%, +500%]**. Below `−100` or above `+500` →
  `SCENARIO.INVALID_SHOCK`. A shock that would produce a negative price is
  invalid (`1 + shock/100 < 0`); `−100%` yields a price of 0 (valid).
- Impact is computed on **market value**, never on average cost or cost basis.

**Consequences:** Direct equity shocks are deterministic, bounded and
auditable.
