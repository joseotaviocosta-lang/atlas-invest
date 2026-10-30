# ADR-310: Evidência Histórica de Custo Fora do Livro-Razão de Transações

## Contexto

Posições derivadas do replay (ex.: KCRE11, 300 unidades, `INCOMPLETE`) podem ter
quantidade integralmente representada no livro e custo de aquisição parcialmente
desconhecido (ex.: TRANSFER_IN de abertura sem custo). Criar um BUY sintético
para "fornecer" custo duplicaria quantidade e fabricaria realização — violando
o ledger append-only, a invariante de posição não-negativa e a semântica
fail-closed do motor tributário.

## Decisão

1. A evidência de custo (`CostBasisEvidence`) é um conceito independente do
   ledger: afirma que unidades já representadas carregam custo factual
   comprovado. Nunca é replayed, nunca cria/move/reescreve quantidade.
2. O status canônico `costBasisStatus` (`KNOWN`/`INCOMPLETE`) permanece
   congelado e derivado exclusivamente do replay. A cobertura de evidência é
   uma projeção read-side (`CostBasisAssessment`: `COMPLETE`/`PARTIAL`/
   `INCOMPLETE`/`BLOCKED`) que nunca alimenta o tax engine
   (`TAX_COST_ENRICHMENT_NOT_ENABLED`).
3. Somente evidência `VERIFIED` conta para cobertura. O ciclo é
   `DRAFT → REVIEW_REQUIRED → VERIFIED/REJECTED`, com revisões append-only
   (`supersedesId`, versão monotônica) e identidade idempotente por
   `(portfolioId, fingerprint, version)`.
4. Ambiguidade reduz cobertura, nunca a infla: evidência que repete lote do
   livro é `EVIDENCE_REDUNDANT`; segundo documento do mesmo lote econômico é
   `EVIDENCE_LOT_DUPLICATE` (chave de lote exclui identidade documental de
   propósito). Sobre-cobertura falha fechado (`BLOCKED`,
   `COST_EVIDENCE_OVER_COVERAGE`), inclusive como pré-checagem no `verify`.
5. TRANSFER_IN casado com custo transportado está deliberadamente excluído dos
   lotes conhecidos do livro na v1 (limitação documentada): subestimar
   cobertura é fail-closed; superestimar não é.
6. Moedas segregadas sem FX; data de aquisição exige `LocalDate` exata;
   custo desconhecido nunca vira zero; zero conhecido é distinto de ausente.

## Consequências

- **Positivas:** enriquece leitura de custo sem tocar no ledger; trilha de
  auditoria completa por revisão; porta de integração tributária permanece
  explicitamente fechada até prova de equivalência.
- **Negativas:** cobertura pode subestimar (transferências casadas, lotes
  ambíguos); `COMPLETE` na avaliação não significa custo utilizável no IR —
  a UI deve exibir o aviso fiscal permanentemente.
