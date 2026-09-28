# Contrato: TaxInputConflictResolution v1 (Fase 4B.4)

Resolução explícita de conflitos de input tributário (ADR-260).

## Ações

- `KEEP_EXISTING` — mantém o valor canônico atual; conflito encerrado.
- `ACCEPT_NEW` — aplica o candidato registrado; valor anterior preservado em `provenance.history`.

## Endpoint

`POST /api/v1/fiscal/inputs/:entity/:id/resolve` com `{ action, resolutionSource? }`.
`entity ∈ { trade-classification, withholding, fii-metadata }`.

## Regras

1. Escopo do sujeito: só o próprio titular resolve (cross-user → 404).
2. O candidato conflitante é registrado em `provenance.conflictingCandidate` no momento do conflito.
3. `resolution` (`action`, `resolutionSource`, `resolvedAt`) é persistida.
4. Registros originais nunca são destruídos; não há delete.
5. Conflito resolvido deixa de ser `CONFLICT` (não é mais rebaixado na prontidão).
6. Resolução é decisão do usuário/aplicação, nunca lei tributária.
