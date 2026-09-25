# ADR-179 — Grounded AI Explanation Boundary

## Status

Approved (Phase 3R)

## Context

Phase 3Q established the canonical, deterministic grounding context (`PortfolioAiGroundingContextV1`), capturing atomic verifiable financial facts derived exclusively from `PortfolioIntelligenceSummary`.
In Phase 3R, we introduce the first model execution capability: bounded portfolio explanations. Without strict boundaries, generative models could fabricate financial claims, speculate on future price movements, recommend asset purchases/sales, or attempt unverified calculations.

## Decision

1. **Evidence-Bound Answers**: Explanations are strictly bounded to the facts provided in `PortfolioAiGroundingContextV1`. The model is prohibited from asserting numbers or facts absent from the grounding context.
2. **AI Model as Explainer, Never Calculator**: The AI model functions exclusively as a pedagogical and descriptive translator of approved metrics. It contains zero calculation authority.
3. **No Raw Ledger Access**: The model and prompt never receive raw transaction ledgers, accounts, or database entities.
4. **Transient Single-Turn Execution**: Explanations are stateless and single-turn. No conversation memory, session tables, or vector databases (RAG) are introduced in this phase.
5. **Segregated Currencies**: The model preserves currency segregation (`BRL`, `USD`) without performing synthetic cross-currency aggregations or implicit FX conversions.

## Consequences

- Financial metrics explained to users match the exact decimal values displayed across the UI and API endpoints.
- Hallucinated returns, fake asset allocations, and speculative narratives are systematically prevented.
- Clear architectural separation between financial engines (calculation) and AI engine (explanation).
