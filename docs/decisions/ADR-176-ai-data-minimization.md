# ADR-176 — AI Data Minimization and Privacy Boundary

## Status

Approved (Phase 3Q)

## Context

Sending sensitive investor data to AI contexts poses severe privacy and security risks. Exposure of authentication credentials, personal identifiers (PII), or exhaustive raw transaction ledgers increases token costs, risks data leaks, and dilutes the model's attention with unneeded technical details.

## Decision

1. **Strict Exclusion of Sensitive Auth Data**: Grounding contexts must never include passwords, password hashes, JWT access tokens, refresh tokens, pepper keys, session IDs, authorization headers, or IP addresses.
2. **User Identification Minimization**: The context contains `portfolioId` as an opaque identifier, but deliberately excludes `userId`, user email, CPF, full name, address, or banking credentials.
3. **No Raw Transaction Ledgers**: The raw ledger (`Transaction[]`) is kept strictly inside `@atlas/database` and `@atlas/portfolio-engine`. The grounding context receives only derived, portfolio-level summaries.
4. **Bounded Context Size**: Because raw positions and transactions are excluded, the context size is strictly bounded to $O(\text{metrics} \times \text{currencies})$. It does not grow with the number of transactions or positions in the portfolio.

## Consequences

- Guaranteed compliance with LGPD / GDPR data minimization principles.
- Zero risk of leaking authentication tokens or personal identities to external model providers.
- Predictable, bounded serialization size (~12.5 KB for BRL-only, ~24.8 KB for BRL+USD) regardless of portfolio scale.
