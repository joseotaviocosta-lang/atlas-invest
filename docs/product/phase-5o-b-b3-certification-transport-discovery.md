# Phase 5O-B — B3 Certification Transport Discovery & Integration Contract

Status: discovery + transport foundation, no live calls, no secrets, no
migrations, no backend endpoints, default DISABLED. Consulted 2026-10-22.

This phase prepares the Atlas technically for a future official integration;
it contracts nothing with B3 and changes nothing about certification status.

## Official sources consulted

| #   | Source                                                     | Accessed   | Version / info captured                                          |
| --- | ---------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| 1   | `developers.b3.com.br/apis?tag=AREADOINvestIDOR` (catalog) | 2026-10-22 | 12 investor APIs with per-API versions (see inventory)           |
| 2   | `developers.b3.com.br/seguranca`                           | 2026-10-22 | OAuth 2.0 + JWS, mutual SSL w/ pinning, TLS 1.2+, 429 policy     |
| 3   | `developers.b3.com.br/apis/autenticacao`                   | 2026-10-22 | 6 auth APIs: 4× Client Credentials (v1.0 + variants), 2× ROPC    |
| 4   | `developers.b3.com.br/contato`                             | 2026-10-22 | B2B-only; RM via clientes.b3.com.br; homologation via RM         |
| 5   | `developers.b3.com.br/duvidas/sandbox`                     | 2026-10-22 | Fictitious pre-canned responses, no prod link                    |
| 6   | `developers.b3.com.br/duvidas/arealogada`                  | 2026-10-22 | Logged-area auth model (B3 clients)                              |
| 7   | `b3.com.br/.../integracoes-da-area-do-investidor-apis`     | 2026-10-22 | Product framing: consent via logged area, D-1, Guia strategy     |
| 8   | B3 webinar material (Nova Área Logada, PDF)                | 2026-10-22 | Movimentação taxonomy; 01/11/2019 history start; 8h availability |

Full swagger/method details require login + access package (verified
directly: the api-details page gates on authentication) — endpoint paths,
payloads, pagination mechanics and rate-limit numbers are therefore
explicitly UNCONFIRMED (see below), not guessed.

## API inventory (public catalog, versions as displayed 2026-10-22)

| API                                 | Version          | Purpose                                      | Required for Atlas   | Freshness | AuthZ dependency | Pagination  | Date filters               | Rate limit | CERT             | PROD     | Identifiers       | Notes                  |
| ----------------------------------- | ---------------- | -------------------------------------------- | -------------------- | --------- | ---------------- | ----------- | -------------------------- | ---------- | ---------------- | -------- | ----------------- | ---------------------- |
| API Guia                            | 1.0.0-rc3        | Authorized documents w/ data on date+product | yes (call planner)   | D-1       | yes              | UNCONFIRMED | date+product (described)   | 429 only   | Pacote de Acesso | licensed | investor document | avoids redundant calls |
| Autorização Fintech                 | 1.0.0-rc7        | Whether investor authorized the fintech      | yes (consent check)  | n/a       | yes              | n/a         | n/a                        | 429 only   | Pacote de Acesso | licensed | investor document | binary semantic        |
| Cadastro Investidor Fintechs        | 1.0.0-rc1        | Fintech investor registration data           | evaluate (PII)       | n/a       | yes              | UNCONFIRMED | UNCONFIRMED                | 429 only   | Pacote de Acesso | licensed | investor document | prefer NOT to persist  |
| Posição                             | 3.3.1-rc2        | Holdings balance per asset+D-1               | yes (snapshot)       | D-1 (~8h) | yes              | UNCONFIRMED | reference date (described) | 429 only   | Pacote de Acesso | licensed | account/asset     | reconciliation source  |
| Movimentação                        | 2.0.2-rc8        | Account transactions in a period             | yes (moves)          | D-1       | yes              | UNCONFIRMED | period (described)         | 429 only   | Pacote de Acesso | licensed | account           | custody+events+loans   |
| Negociação de Ativos                | 2.0.1-rc3        | Listed buys/sells                            | yes (trades)         | D-1       | yes              | UNCONFIRMED | UNCONFIRMED                | 429 only   | Pacote de Acesso | licensed | account           | overlaps Movimentação  |
| Eventos Provisionados               | 2.0.0-rc1        | Provisioned equity income events             | yes (income)         | D-1       | yes              | UNCONFIRMED | UNCONFIRMED                | 429 only   | Pacote de Acesso | licensed | account/asset     | provisioned ≠ paid     |
| FintechSistema                      | 1.0.0-rc1        | Last system load date                        | yes (`sourceAsOf`)   | n/a       | yes              | n/a         | n/a                        | 429 only   | Pacote de Acesso | licensed | —                 | freshness authority    |
| Pacote de Acesso                    | 1.0              | Emails the CERT access package               | yes (CERT bootstrap) | n/a       | RM-gated         | n/a         | n/a                        | n/a        | IS the CERT gate | n/a      | email             | per docs               |
| Oferta Pública                      | 2.0.0-rc1        | IPO participation                            | no (out of MVP)      | D-1       | yes              | —           | —                          | 429 only   | Pacote de Acesso | licensed | —                 | document & defer       |
| Garantias                           | (b3.com.br list) | Collateral administration                    | no (out of MVP)      | D-1       | yes              | —           | —                          | —          | Pacote de Acesso | licensed | —                 | document & defer       |
| STVM Request/Response Authorization | 1.0.0-rc1        | Custodian token (STVM-exclusive)             | no                   | n/a       | STVM only        | —           | —                          | —          | —                | —        | —                 | not applicable         |

Versions are `-rc`/release-candidate labels as displayed; do not hardcode
them into domain rules (version drift is expected; the provider records
family only where needed).

Overlaps with an explicit policy: Negociação de Ativos ⊂ Movimentação
(trades also appear as movements). Atlas consumes Negociação for canonical
trades and Movimentação for custody/income/corporate moves, and never sums
both into one position — reconciliation (ledger vs Posição) is the arbiter.

## Authentication (confirmed vs unconfirmed)

Confirmed (official Segurança + Autenticação catalog):

- OAuth 2.0 with JWS tokens; application grant Client Credentials v1.0
  (+ Category_ID / chave / Scope header variants); ROPC family exists but is
  NOT the fintech path (no password handling in Atlas, ever).
- Mutual TLS: B3-issued client certificate + private-key password;
  certificate pinning of the root cert in the client app; HTTPS, TLS 1.2+.
- Rate limiting exists; violations return HTTP 429.

UNCONFIRMED_REQUIRES_B3_CERT_PACKAGE: token endpoint URL, field names,
token/refresh lifetimes and refresh semantics, mTLS handshake details and
certificate lifecycle/rotation, per-API quotas/headers/Retry-After values,
error body shapes, base URLs/hosts.

## Investor consent (separate from app auth)

- Grant: express consent by the investor via login in the B3 new logged area.
- Check: Autorização Fintech answers "authorized or not" for the fintech.
- Revocation: detected by re-checking (loss of a previously-held
  authorization surfaces as revoked; no callback is documented publicly).
- Mapping onto Atlas states (no machine changes): AUTHORIZED→`AUTHORIZED`;
  loss from a live state→`REVOKED`; never-authorized→`NOT_CONNECTED`;
  undecidable→`REQUIRES_REAUTHORIZATION` from live states, else preserved.
  Implemented in `consent.ts`, tested.

## Environments

| Mode        | Meaning                                  | Network            | Config requirement                           |
| ----------- | ---------------------------------------- | ------------------ | -------------------------------------------- |
| `DISABLED`  | default; Atlas never touches B3          | none               | nothing                                      |
| `SIMULATED` | current 5M in-memory provider            | none               | nothing                                      |
| `CERT`      | homologation (via Pacote de Acesso + RM) | B3 CERT hosts only | explicit baseUrl + all credential references |
| `PROD`      | licensed production (contract required)  | B3 PROD hosts only | explicit baseUrl + all credential references |

`resolveB3IntegrationMode` defaults to `DISABLED`; `NODE_ENV` is never
consulted; `CERT`/`PROD` fail closed without complete explicit config.
CERT and PROD never share hosts or credentials (separate config instances).

## Transport architecture (`packages/b3-integration`)

```text
B3HttpProvider (async source capabilities, CERT-gated, no ledger access)
  → B3HttpClient (transport only: timeout, retry, error translation, redacted logs)
  → B3TokenCache (single-flight OAuth acquisition, memory-only, skewed expiry)
  → B3ApiMapper (strict-schema → canonical records; 5P provides production shapes)
  → existing Atlas pipeline (normalize → classify → preview → confirm → ledger)
```

Responsibilities are fenced by tests: the client never writes, never
dedupes, never corrects, never taxes; mappers receive zod-validated DTOs
only; fetch is injected (no global-fetch fallback — importing the module
cannot touch any network).

## Endpoint responsibility matrix

| Capability    | Endpoint family (provisional paths)    | Atlas concept                               |
| ------------- | -------------------------------------- | ------------------------------------------- |
| Guia          | `/investidor/guia`                     | call planner (which documents need refresh) |
| Autorização   | `/investidor/autorizacao-fintech`      | consent verdict → sync state                |
| Posição       | `/investidor/posicao`                  | reconciliation snapshot                     |
| Movimentação  | `/investidor/movimentacao`             | custody moves (+trades overlap)             |
| Negociação    | `/investidor/negociacao` (provisional) | canonical trades                            |
| Provisionados | `/investidor/eventos-provisionados`    | income candidates                           |
| Freshness     | `/investidor/fintech-sistema`          | `sourceAsOf`                                |

Paths are provisional (UNCONFIRMED); the matrix is about responsibility,
not URLs. Guia-first: guide first, then product calls only for documents
with data — never redundant polling.

## Error taxonomy / retry / pagination / rate limits

- Taxonomy: `AUTHENTICATION_FAILED`, `AUTHORIZATION_REVOKED`,
  `RATE_LIMITED`, `UPSTREAM_TIMEOUT`, `UPSTREAM_UNAVAILABLE`,
  `INVALID_UPSTREAM_PAYLOAD`, `CERTIFICATE_ERROR`, `CONFIGURATION_ERROR`,
  `PARTIAL_DATA`. 401→stop+reauth, 403→revoked-stop, 404→config error,
  429→honor Retry-After, 5xx→unavailable. Raw bodies never leave the boundary.
- Retry: timeout/reset/429/502/503/504 only; never 400/401/403/revoked/
  schema/cert errors; deterministic bounded backoff (cap 5s, ≤10 attempts).
- Pagination: cursor-agnostic `{items, nextCursor}` envelopes, `maxPages`
  guard (default 100); hitting the cap reports `partial:true` (PARTIAL).
- Rate limits: only HTTP 429 confirmed; numbers/quotas/headers
  UNCONFIRMED — architecture tolerates 429 regardless.

## Secret / certificate / token handling

- Config holds REFERENCES (secret-manager names), never values; `clientId`
  is the only non-secret field. No `NEXT_PUBLIC_*` B3 secret, ever; the
  frontend receives no secret, key, certificate or B2B token.
- mTLS materials live in runtime secret storage; `.pfx/.p12/.pem/.key`
  are git-ignored (guardrail, not a substitute for secret management).
- Tokens: memory-only, skewed expiry, single-flight, never logged, never
  persisted, invalidated on 401. Logs: endpoint/status/counts/correlation
  only, deep-redacted.

## PII / retention

- B3 identifies investors by document (CPF/CNPJ semantics per public
  material). Policy: transient use for calls only; persist technical
  substitutes (AssetId/account/portfolio links) instead. Cadastro data is
  not persisted in this phase (evaluate need in 5P).
- No raw-payload persistence, no integral transport logs, no consent-evidence
  store in 5O-B — documented as 5P prerequisites, not built.

## Certification / commercial prerequisites

- Environment CERT is obtained via the Relationship Manager
  (`clientes.b3.com.br`); homologation access likewise via RM.
- Pacote de Acesso generates/sends the CERT access package by e-mail.
- Confirmed process facts end at the RM + package; healthchecks, mandatory
  tests and license terms are UNCONFIRMED until the package arrives.

## Owner action checklist

1. Contact the B3 Relationship Manager via clientes.b3.com.br to open the
   B2B API contracting conversation (Atlas is not yet a client).
2. Confirm commercial/license requirements for Área do Investidor APIs.
3. Request homologation (CERT) access through the RM.
4. Receive the Pacote de Acesso (by e-mail) and complete CERT bootstrap.
5. Confirm OAuth client credentials + mTLS certificate issuance/rotation
   process with B3.
6. Run the first CERT healthcheck (FintechSistema read) and share the
   observed endpoint shapes with engineering.
7. Only then authorize engineering to start 5P (CERT integration).

No contact was made by this phase; only public paths above are provided.

## Engineering next steps (5P, blocked on owner)

Async orchestration variant over `B3AsyncSourceProvider`; production
`B3ApiMapper` pinned against CERT swagger; consent evidence persistence;
sync cursor persistence; contract-test suite against CERT; monitoring.

## Verification (5O-B)

- `pnpm test:b3-integration` — 23/23 (mocked transport contracts).
- Boundaries extended: apps never import `@atlas/b3-integration`;
  transport package dependency/import fenced (no UI/apps/database/Prisma/
  NestJS/fetch-globals/mock-leak).
- Mock B3 pipeline untouched: import-engine 83/83 green.
- No B3 calls executed (fetch is injected; tests use fakes; no CERT config
  exists anywhere). 0 migrations. UX stays `PREPARING`.
