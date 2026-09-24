# ADR-173 — AI Grounding Boundary & Read-Model Primacy

## Status

Approved (Phase 3Q)

## Context

As Project Atlas evolves toward contextual AI assistance, there is a fundamental risk that language models could hallucinate, approximate, or recompute financial figures. In financial applications, generating numbers probabilistically or having an AI engine perform arithmetic on raw financial ledgers violates core architectural invariants:

1. Float arithmetic causes rounding corruption.
2. An LLM is not a deterministic calculation engine.
3. Complex financial metrics (TWR, XIRR, benchmark differences, realized volatility, beta, drawdown, VaR, CVaR, scenario impacts) require verified formulas implemented in dedicated engines (`@atlas/portfolio-engine`, `@atlas/performance-engine`, `@atlas/risk-engine`, `@atlas/benchmark-engine`, `@atlas/scenario-engine`).

## Decision

1. **AI Grounding $\neq$ AI Generation**: Phase 3Q implements solely the structured data grounding layer. No LLM or external model provider (OpenAI, Anthropic, Gemini, local models) is invoked.
2. **Approved Read Models as Source of Truth**: The grounding context consumes exclusively the approved `PortfolioIntelligenceSummary` from `@atlas/portfolio-intelligence` (Phase 3P). Raw transaction ledgers, Prisma entities, and unverified client inputs are strictly excluded.
3. **Zero Financial Recalculation**: `@atlas/ai-engine` is purely a deterministic transport and schema boundary. It contains zero financial formulas and performs zero floating-point arithmetic.
4. **No LLM Calculation Authority**: AI in Project Atlas will never be the source of truth for financial metrics.

## Consequences

- Guaranteed mathematical consistency between the UI charts, API endpoints, and any future AI responses.
- AI responses will be anchored to verified facts, eliminating hallucinated returns or incorrect risk numbers.
- Architectural purity: `@atlas/ai-engine` depends only on domain and intelligence read-model types, with zero I/O and zero database access.
