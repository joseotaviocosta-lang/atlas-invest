# ADR-181 — Upstream AI Intent & Capability Gate

## Status

Approved (Phase 3R)

## Context

Financial regulation (CVM, SEC) strictly forbids algorithmic investment advice, buy/sell recommendations, and speculative performance projections unless registered as an investment consultant/analyst. Moreover, user requests for novel arithmetic calculations or tax advice violate Project Atlas core architectural principles (all math belongs in domain engines; tax belongs exclusively in `@atlas/tax-engine`). Invocating an LLM to refuse these questions wastes API credits, introduces latency, and risks jailbreaks.

## Decision

1. **Deterministic Upstream Gate**: All incoming user queries are processed by `classifyExplanationIntent(question)` before any grounding context generation or model provider call.
2. **Zero-Call Refusal**: Queries classified as unsupported intents (`UNSUPPORTED_RECOMMENDATION`, `UNSUPPORTED_PREDICTION`, `UNSUPPORTED_CUSTOM_CALCULATION`, `UNSUPPORTED_TAX_ADVICE`):
   - Trigger **0 grounding context calls**.
   - Trigger **0 AI model provider calls**.
   - Return immediately with `status: 'UNSUPPORTED'`, canonical refusal copy, and empty evidence lists.
3. **HTTP 200 Refusal Semantics**: Refusals are normal business outcomes, not system errors. The endpoint returns `200 OK` with structured metadata indicating the unsupported intent and clear guidance.

## Consequences

- Complete protection against non-compliant financial advice and regulatory violations.
- Significant reduction in LLM inference costs and latency for unsupported queries.
- Consistent, predictable refusal messaging without relying on LLM compliance.
