# ADR-183 — AI Prompt Injection & Demarcation Boundary

## Status

Approved (Phase 3R)

## Context

User queries are untrusted input. Adversarial prompts may attempt "jailbreaking", prompt injection, leaking system prompt instructions, or forcing the model to calculate unapproved numbers or generate recommendations.

## Decision

1. **XML Boundary Demarcation**:
   - The user query is encapsulated in `<USER_QUESTION>` tags.
   - Grounding facts are encapsulated in `<GROUNDING_FACTS>` tags.
   - The system prompt instructs the model to treat content within `<USER_QUESTION>` solely as semantic inquiry, ignoring any instructions to ignore previous instructions, change roles, or deviate from output schemas.
2. **Input Sanitization**: User questions are trimmed, length-limited (min 3, max 1000 characters), and pre-processed before prompt assembly.
3. **Strict JSON Schema Enforcement**:
   - The model is mandated to return valid JSON adhering to the explanation contract.
   - Server-side parsing validates the JSON structure using Zod before returning to the caller.
   - Any unparseable model response triggers a graceful fallback explanation grounded in verified facts.

## Consequences

- Robust defense against prompt injection and role hijacking.
- Predictable, machine-readable output structure from any LLM provider.
- Isolation between untrusted user input and trusted analytical data.
