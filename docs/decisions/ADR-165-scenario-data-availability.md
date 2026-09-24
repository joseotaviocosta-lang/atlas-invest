# ADR-165 — Scenario Data Availability

**Status:** Accepted — 2026-09-23 (Fase 3O)
**Context:** Stress testing operates on market value. A position without a
resolvable quote has an unknown value, which is not zero.

**Decision:**

- A position without a market value/price is **excluded** from the stressed
  calculation and reported — never treated as an implicit zero.
- Currency result exposes `positionCount`, `valuedPositionCount`,
  `unvaluedPositionCount`. When any position is unvalued the currency status is
  `PARTIAL`.
- Coverage is reported as a **count** (`valuedPositionCount / positionCount`),
  never as a portfolio-value coverage percentage — the value of the missing
  positions is unknown, so a value-based percentage would be misleading.
- Series/currency/top-level availability:
  `AVAILABLE` (all valued, all components available) · `PARTIAL` (some unvalued
  positions or an unsupported component) · `UNAVAILABLE` (no valued positions or
  the required reference is missing).
- Scenarios are computed and segregated **per currency**; BRL and USD are never
  aggregated and no FX conversion is applied.

**Consequences:** Scenario results are honest about coverage and never invent
value.
