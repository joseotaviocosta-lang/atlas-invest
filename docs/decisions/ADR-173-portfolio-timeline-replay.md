# ADR-173 — Portfolio Timeline Replay

**Status:** Accepted — 2026-09-23 (3P performance closure)
**Context:** Historical valuation resolves one full replay-from-origin per
calculation date (`O(n_dates × n_transactions)`). A single chronological pass
with per-date state materialization is required for large histories.

**Decision:** Add an additive `replayPortfolioTimeline({ transactions,
portfolioId, asOfDates })` to `@atlas/portfolio-engine` that validates, sorts
and processes the ledger ONCE and materializes an immutable `PortfolioState`
per requested date.

- It reuses the canonical `ReplayContext`, `dispatchTransaction`, transfer-pair
  resolution and finalization — no duplicated financial rule.
- Transfer pairs are resolved once from the FULL ledger so cross-date matched
  transfers carry cost correctly (origin-side removal is asOf-independent; the
  in-leg is always matched when dispatched because the out-leg precedes it).
  Consequently an out-leg's `AppliedTransfer` audit status reflects the pair's
  ultimate resolution; `state.assets` (positions, costs, statuses) and all
  accumulated summaries are exactly equivalent to `replay(asOf=D)`.
- `replay()` / `replayPortfolio()` are unchanged (they share the extracted
  helpers; 243 existing tests green plus 10 timeline-equivalence tests).
- The public package API gains one additive export; Portfolio Read API v1 is
  unchanged. Package version stays `1.0.0-rc.1` (rc.2 only if a release
  process requires it for the additive export).
- The performance layer consumes the timeline for historical valuation
  batches; `replayPortfolio` remains for single-date callers.

**Consequences:** Historical replay is `O(n_transactions + n_dates ×
finalization)` with zero behavioral change to existing consumers.
