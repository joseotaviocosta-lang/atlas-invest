# ADR-131 — Risk Calculation Series vs Chart Display Series

**Status:** Accepted — 2026-09-21 (Fase 3I)
**Context:** The 3H chart deliberately downsamples (AUTO: ≤90d DAILY,
91–365d WEEKLY, >365d MONTHLY, ≤400 points). Computing "daily volatility"
from 62 monthly chart points would silently redefine the methodology and
produce wrong risk numbers.

**Decision:** Three formally distinct date concepts (ADR-132 refines this
ADR post-audit):

- **TWR calculation boundaries** = EVERY civil date in `[start, end]` ∪
  external-flow dates (DAILY methodology layer for exact neutralization).
- **Risk statistical observations** = subperiods ending on ECONOMIC dates
  (start anchor + ≥1 `EXACT` price) — a strict subset selected by
  `selectRiskStatisticalReturns`. Never chart samples, never raw calendar
  days.
- **Chart display dates** remain presentation-only (ADR-124) and are never
  fed to the risk engine (grep-guaranteed: the risk use-case builds its own
  date set; the risk engine accepts no granularity/display types).
- Both endpoints share ONE implementation for replay, price resolution and
  flow collection (`PerformanceCalculationContextBuilder`) — shared
  pipeline, divergent date sets. No duplicate provider fetching per page:
  each endpoint builds its own context per request (no Redis, no global
  cache per §48); client query keys isolate `portfolio-risk` from
  `portfolio-performance-series`.
- If 5Y daily risk ever becomes too expensive, the only acceptable options
  are: optimize pipeline/reuse/cache, document an explicit limit/cap, or
  declare 5Y risk unavailable when methodology cannot be preserved. Reducing
  frequency silently is a FAIL.

**Consequences:** Methodology preserved at every horizon; cost is explicit
and auditable (see 3I final report §PERFORMANCE).
