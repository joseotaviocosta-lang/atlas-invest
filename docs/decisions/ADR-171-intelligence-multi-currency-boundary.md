# ADR-171 — Intelligence Multi-Currency Boundary

**Status:** Accepted — 2026-09-23 (Fase 3P)
**Context:** The summary spans currencies. No FX conversion exists.

**Decision:** Currencies remain strictly segregated.

- Response shape: `currencies: { BRL: {...}, USD: {...} }`.
- Never a global monetary total (no consolidated patrimônio).
- No FX; benchmarks/risk-free/beta that do not exist for a currency are
  structurally `UNSUPPORTED` and never faked.
- If more than one currency is present, a `MULTI_CURRENCY_PRESENT` observation
  records the list of currencies (scope `PORTFOLIO`) without aggregating values.
- A structural `UNSUPPORTED` for one currency does not force the whole summary
  to `PARTIAL` when the other currency is fully available and has no data gap.

**Consequences:** A multi-currency reading is honest and aggregation-free.
