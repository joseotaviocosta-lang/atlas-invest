# ADR-180 — AI Provider Abstraction & Server-Side Key Isolation

## Status

Approved (Phase 3R)

## Context

Integrating LLMs directly into application logic couples the system to specific vendors (e.g. OpenAI, Anthropic, Google) and risks leaking sensitive credentials (API keys) to client applications (web/mobile). Furthermore, automated tests and CI environments must execute deterministically without outbound network access or paid API token usage.

## Decision

1. **Pure Domain Provider Interface**: `@atlas/ai-engine` defines the pure contract `AIProvider` containing `complete(request: AICompletionRequest): Promise<AICompletionResponse>`.
2. **Server-Side Adapter**: `OpenAiProvider` is implemented strictly in `apps/api/src/infrastructure/ai/openai-ai.provider.ts`. Outbound calls to provider APIs occur exclusively on the NestJS backend.
3. **Secret Isolation**: API keys (`OPENAI_API_KEY`, etc.) are read from server environment variables. Under no circumstances are keys exposed in build bundles, client apps, or API responses.
4. **Deterministic Testing Adapter**: `FakeAiProvider` is provided in `@atlas/ai-engine` and used in test suites and local development when no API key is configured.
5. **Dependency Injection Token**: Repositories and use cases depend on the abstract token `AI_PROVIDER_TOKEN`, enabling seamless swapping between real and test providers.

## Consequences

- Zero credential exposure risk for web and mobile clients.
- Automated tests run 100% offline, deterministically, and with zero financial cost.
- Future provider migrations (e.g. to Gemini, Claude, or self-hosted models) require only an adapter change.
