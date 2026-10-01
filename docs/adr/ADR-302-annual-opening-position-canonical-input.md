# ADR-302: Entrada Canônica de Posição de Abertura Pré-Atlas (Annual Opening Position)

## Contexto

Investidores que iniciam o uso do Project Atlas frequentemente possuem ativos adquiridos antes do início do histórico de transações importado ou registrado no livro-razão. Sem a informação de quantidade e custo histórico de aquisição desses ativos, o cálculo anual de Bens e Direitos para o IRPF em 31/12 ficaria irremediavelmente bloqueado (`costBasisStatus = INCOMPLETE`).

## Decisão

1. Implementar o modelo canônico de entrada `AnnualOpeningPositionInput` (`annual_opening_position_inputs`).
2. A identidade lógica da posição de abertura é `(taxSubjectId, portfolioId, accountId, assetId, revision)`.
3. Revisões subsequentes incrementam `revision` de forma estritamente monotônica e marcam a versão anterior como `SUPERSEDED`, preservando a rastreabilidade e histórico de auditoria.
4. Submissões com conteúdo idêntico (`fingerprint` SHA-256 idêntico) são tratadas de forma idempotente (`IDEMPOTENT_CONFIRMED`).
5. Invariante Anti-Sobreposição: Se houver transações no livro-razão com `tradeDate <= openingPosition.effectiveDate` para o mesmo ativo, a aplicação da posição de abertura é bloqueada (`OVERLAPPING_OPENING_AND_LEDGER_HISTORY`).
6. Posições em rascunho (`DRAFT`) exigem confirmação explícita do investidor antes de serem aplicadas como base no cálculo de posições.

## Consequências

- Positivas: Permite apuração de IRPF anual para investidores com posições anteriores sem corromper a imutabilidade do ledger.
- Negativas: Exige checagem de sobreposição cronológica contra o histórico de transações.
