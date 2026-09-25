# ADR-185 — AI Explanation Privacy & Logging Sanitization

## Status

Approved (Phase 3R)

## Context

Financial data privacy is paramount in Project Atlas. Investor transactions, balances, and queries must not leak into persistent system logs, monitoring aggregators, or unauthorized third parties.

## Decision

1. **No Log of Financial Payloads**: Logs recorded during AI explanation execution contain exclusively technical metadata:
   - `requestId`
   - `portfolioId`
   - `intent`
   - `status` (`ANSWERED` or `UNSUPPORTED`)
   - `executionDurationMs`
   - `modelProvider` and `model`
2. **Exclusion of Questions and Explanations from Standard Logs**: User question text and generated explanation bodies are not logged in standard application logs to prevent PII and financial inquiry disclosure.
3. **Strict Secret Masking**: API keys, bearer tokens, and session identifiers are sanitized before logging in `@atlas/logger`.
4. **Transient State**: Explanations are not stored in any database table. Once transmitted to the client, the explanation lifecycle is complete.

## Consequences

- Full alignment with LGPD (Lei Geral de Proteção de Dados) and security best practices.
- Minimized attack surface in log aggregation platforms (e.g. Datadog, CloudWatch).
- Preserves investor confidentiality across all platform tiers.
