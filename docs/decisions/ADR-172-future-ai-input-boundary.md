# ADR-172 — Future AI Input Boundary

**Status:** Accepted — 2026-09-23 (Fase 3P)
**Context:** A future AI layer may want to consume the consolidated reading.

**Decision:** The Portfolio Intelligence Summary is a candidate structured
input for the future AI layer, but:

- Phase 3P does NOT call the AI engine; `@atlas/ai-engine` remains untouched.
- The AI layer, when built, must not become the source of truth for financial
  metrics: it consumes the already-computed, canonical read models.
- No LLM, no prompt generation, no embeddings, no RAG, no vector DB, no chatbot,
  no recommendations in this phase.
- Observations are facts; AI must not convert them into recommendations and
  present them as the system's own metric computation.

**Consequences:** The contract is AI-ready without introducing AI, and the
metrics remain engine-owned.
