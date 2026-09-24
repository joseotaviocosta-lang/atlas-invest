# ADR-134 — CDI as BRL Risk-Free Proxy

**Status:** Accepted — 2026-09-22 (Fase 3J)
**Context:** Sharpe/Sortino need a reference return series. Brazil's CDI
(daily, business-days, institutional BCB SGS 12 source integrated in 3G) is
the natural reference for BRL portfolios — but calling it "risk-free" as a
literal guarantee would be a false claim.

**Decision:** CDI is used as an explicit methodological PROXY for BRL
portfolios only, centralized in the canonical `RiskFreeProxy = 'CDI'`
contract (no hardcoded string scattered through the codebase).

- Stated exclusively as proxy: UI label is "Referência usada: CDI", never
  "livre de risco". Docs never assert "CDI is risk free".
- Only `CDI` in this phase (no generalized risk-free instrument framework).
- `USD` (and any non-BRL currency): `UNAVAILABLE` with
  `riskFreeProxy: null` — CDI is never applied cross-currency; no FX.
- Missing CDI observations are never treated as zero (intersection
  narrows; PARTIAL/UNAVAILABLE per contract). Provider failure yields
  UNAVAILABLE — no `0%`, IBOV or hardcoded fallback.

**Consequences:** Honest, BRL-scoped reference semantics with a single
extension point if more proxies ever arrive.
