# ADR-263: Versionamento do Registro de Vencimentos

## Status

Aceito (Fase 4C.2)

## Contexto

A Receita Federal pode corrigir ou republicar a Agenda Tributária. Datas
históricas de vencimento não podem mudar silenciosamente.

## Decisão

1. `FederalTaxDeadlineEntry` é imutável. Correção cria **nova versão**.
2. Identidade: `(revenueCode, competence, version)`.
3. No máximo uma entrada `VERIFIED` ativa por `(revenueCode, competence)`
   (índice único parcial no banco).
4. A versão anterior é marcada `SUPERSEDED`; a nova aponta `supersedesEntryId`.
5. Obrigações vinculadas à versão antiga tornam-se stale/reconciliação
   conforme o estado de pagamento (ADR-267).
6. Proveniência preservada: `sourceAuthority`, `sourceDocument`,
   `sourceReference`, `sourcePublishedAt`, `verifiedAt`, `version`.

## Consequências

- Auditoria completa; nenhuma reescrita de fato oficial.
- Datas passadas permanecem estáveis.
