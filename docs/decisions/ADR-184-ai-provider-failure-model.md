# ADR-184 — AI Provider Failure Model & Resiliency

## Status

Approved (Phase 3R)

## Context

Third-party AI providers are subject to rate limiting, network partitions, outages, and slow responses. The API must handle these failures gracefully without leaking provider internals, failing unhandled with 500 Internal Server Errors, or compromising application availability.

## Decision

1. **Provider Isolation**: All external network calls to AI APIs are wrapped in try/catch blocks within `ExplainPortfolioWithAiUseCase`.
2. **Standardized Error Mapping**: Provider errors (rate limits, timeouts, connection drops) are translated to `503 Service Unavailable` with message `"Serviço de inteligência temporariamente indisponível. Tente novamente em instantes."`.
3. **Internal Stack Trace Protection**: External API errors and provider HTTP details are logged safely to the backend logger (without API keys) and never exposed in client API responses.
4. **Endpoint Rate Limiting**: The endpoint is guarded by NestJS `@Throttle({ default: { limit: 20, ttl: 60000 } })` to protect provider quotas and prevent denial-of-service.

## Consequences

- Frontend clients receive predictable error envelopes with actionable Brazilian Portuguese feedback.
- Backend infrastructure is shielded from provider brownouts or quota exhaustion.
- Clear distinction between domain validation errors (400), authorization (401/404), client throttling (429), and external provider unavailability (503).
