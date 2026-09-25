# ADR-182 — AI Evidence Validation & Fail-Closed Citation Model

## Status

Approved (Phase 3R)

## Context

Even with structured prompt engineering, LLMs may hallucinate citations, fabricate fictitious fact identifiers, or return empty evidence arrays while making unsupported factual statements. The client interface must never display unverified citations or present assertions as factual without grounding proof.

## Decision

1. **Server-Side Evidence Resolution**: Citations returned by the model (`evidenceFactIds`) are validated strictly against `context.facts` via `validateExplanationEvidence(...)`.
2. **Discard Unknown Fact IDs**: Any citation that does not match a real `factId` in the grounding context is purged.
3. **Fail-Closed Fallback**:
   - If the model returns 0 valid citations for a supported explanation, the system attaches fallback evidence consisting of key available facts (e.g. TWR, Sharpe ratio, Volatility).
   - If the grounding context itself contains no available facts, the explanation transitions to `UNSUPPORTED`.
4. **Enriched Verified Evidence**: The response provides full `GroundedFinancialFact` objects (`verifiedEvidence`), allowing frontends to render exact decimal strings, labels, and nature badges (`HISTÓRICO`, `HIPÓTESE`) directly from verified sources.

## Consequences

- 100% of evidence displayed to end users is guaranteed to originate from verified domain calculations.
- Eliminates phantom citation errors and broken references in UI cards.
- Provides cryptographic-like integrity between analytical engines and displayed explanations.
