# ADR-256: Proveniência de Inputs Tributários Manuais

## Status

Aceito (Fase 4B.3)

## Contexto

Inputs manuais podem ser confundidos com dados oficiais se não tiverem
proveniência explícita.

## Decisão

1. Todo input manual usa `sourceType` `MANUAL`/`MANUAL_CONFIRMED` e registra `confirmedAt`.
2. Manual não sobrescreve importado; divergência gera conflito.
3. Manual é **fato**, não regra: não ativa responsabilidade tributária.
4. Sem PII desnecessária; autor implícito/auditável.
5. `UNKNOWN` permanece `UNKNOWN` (usuário pode não informar).

## Consequências

- Rastreabilidade e ausência de valores fabricados.
- Manual e importado convivem com conflito explícito.
