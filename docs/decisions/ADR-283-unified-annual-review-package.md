# ADR-283: Unified Annual Review Package as a Deterministic Projection over 4J.1

**Status:** Accepted (Phase 4J.2)
**Data:** 2026-10-08

## Contexto

A Fase 4J.1 entrega o estado anual unificado (`UnifiedAnnualIrpfState`) sobre 4H/4I. Usuários e contadores precisam de um artefato de revisão/exportação desse estado (pacote anual, apoio à declaração, trilha de proveniência) sem reabrir cálculos tributários e sem produzir artefatos oficiais.

## Decisão

1. O `UnifiedAnnualReviewPackage` é uma **projeção determinística pura** sobre **exatamente um** `UnifiedAnnualIrpfState`, montada pelo serviço a partir de **uma única** chamada a `UnifiedAnnualIrpfService` por requisição.
2. O pacote **nunca** recalcula tributo, **nunca** reconstrói valores a partir do ledger ou dos motores 4H/4I, e **nunca** se torna fonte da verdade (sem persistência, sem migration).
3. `package.status` é cópia verbatim do status global 4J.1; um estado `BLOCKED` nunca gera pacote `READY_FOR_REVIEW`.
4. `packageFingerprint` (SHA-256) exclui `generatedAt` e é invariante à ordem de módulos/requisitos/issues; qualquer revisão de fonte/evidência (via `annualFingerprint`) ou bump de `packageVersion` muda o fingerprint.
5. O registro de apoio à declaração emite **0** entradas `VERIFIED_OFFICIAL_MAPPING` (leiaute DIRPF Exercício 2027 não publicado); apenas `GENERAL_SUPPORT`/`NO_OFFICIAL_MAPPING`.
6. Exportações (JSON + CSV OWASP-escaped) e a web são **apoio à revisão** com banner e disclaimer compulsórios; `READY_FOR_REVIEW ≠ declarado/enviado/pago`.

## Consequências

- Nova superfície de API (`review-package`, `review-package/export`) acima das rotas 4J.1, com `private, no-store` em todos os caminhos via middleware estendido.
- Nova página-ação na web anual unificada (exportação + aviso stale local, sem persistência de histórico).
- Congela-se o schema do pacote em `docs/contracts/unified-annual-review-package-v1.md`.
- Invariantes anteriores (4H, 4I, 4J.1, market intelligence) permanecem intactos.
