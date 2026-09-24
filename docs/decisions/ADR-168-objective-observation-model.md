# ADR-168 — Objective Observation Model

**Status:** Accepted — 2026-09-23 (Fase 3P)
**Context:** A consolidated reading naturally invites interpretation. The Atlas
must present FACTS, never judgments or recommendations.

**Decision:** `PortfolioObservation[]` carries deterministic, factual,
traceable, data-backed observations.

- Shape: `{ code, scope, status, source, values }`.
- Initial codes (only these): `PERFORMANCE_VS_IBOV`, `PERFORMANCE_VS_CDI`,
  `CURRENT_DRAWDOWN`, `MAX_DRAWDOWN`, `TAIL_RISK_95`, `EQUITY_DOWN_10_IMPACT`,
  `PARTIAL_VALUATION`, `INCOMPLETE_DATA`, `MULTI_CURRENCY_PRESENT`.
- Deterministic order (fixed) and no duplicate `code + scope`.
- Values are numbers/strings copied from canonical read models — never
  recomputed with floating point.
- `CURRENT_DRAWDOWN` is omitted when exactly `0`.
- Unavailable sources produce no observation (except `INCOMPLETE_DATA`, which
  carries stable reason codes); data quality covers absence.
- No interpretation labels (`OUTPERFORMING`/`UNDERPERFORMING`), no
  recommendation, no qualitative judgment, no score.

**Consequences:** Highlights are auditable facts; the UI may only render
deterministic factual templates.
