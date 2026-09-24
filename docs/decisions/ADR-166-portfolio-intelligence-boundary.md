# ADR-166 — Portfolio Intelligence Boundary

**Status:** Accepted — 2026-09-23 (Fase 3P)
**Context:** The Atlas computes many metrics individually. A consolidated
portfolio reading is needed without creating a new formula or an AI layer.

**Decision:** Create `@atlas/portfolio-intelligence` `0.1.0` — a PURE
deterministic aggregator that receives already-computed read models and
produces one summary with structured data quality and objective observations.

- It owns NO financial formula: it never replays the ledger, fetches prices,
  calls providers, recalculates TWR/Sharpe/Beta/VaR, or prices scenarios.
- Pure, deterministic, zero I/O, zero Prisma/Nest/React, frozen outputs.
- The application `GetPortfolioIntelligenceSummaryUseCase` orchestrates the
  approved engines over a shared context. `@atlas/portfolio-engine` never
  imports portfolio-intelligence.
- No AI, no LLM, no RAG, no chatbot, no recommendation, no score, no rating,
  no ranking, no grade, no traffic light, no health classification.

**Consequences:** One auditable portfolio reading; the future AI layer (ADR-172)
can consume this contract without becoming the source of truth for metrics.
