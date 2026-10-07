# ADR-282 (4J1-E): Architecture Allow-List — PORTFOLIO_REPOSITORY + FISCAL_CLOCK Permitted

## Status

Aceito (Fase 4J.1)

## Contexto

O bloco de arquitetura de 4I.6 usa uma proibição ampla `/Repository/` para o
serviço de revisão. O serviço anual unificado precisa de `PORTFOLIO_REPOSITORY`
(para o fan-out de posições via `findByUserId`) e de `FISCAL_CLOCK` (para o
`generatedAt` determinístico), portanto não pode clonar aquela proibição ampla.

## Decisão

1. O teste de arquitetura para `get-unified-annual-irpf.use-case.ts` usa uma
   **allow-list explícita**: deve consumir os cinco `Get*UseCase` e o assembler
   puro `buildUnifiedAnnualIrpfState`; deve referenciar `PORTFOLIO_REPOSITORY` e
   `FISCAL_CLOCK`.
2. Proibições específicas (sem proibição genérica `/Repository/`): não importar
   tipos de linha/mapper de `@atlas/database` (`HighIncomeEvidenceRow`,
   `TaxpayerConfirmationRow`), não chamar primitivas de recomputação
   (`calculate*`, `buildAnnual*`, `replayPortfolio`) e não injetar diretamente
   um repositório de evidências/confirmações fiscais
   (`HIGH_INCOME_EVIDENCE_REPOSITORY`, `TAXPAYER_CONFIRMATION_REPOSITORY`).
3. O módulo puro `annual-irpf/unified-annual-*.ts` não importa
   NestJS/Prisma/@atlas/database/React.

## Consequências

- A fronteira de orquestração é fiscalizada sem bloquear o fan-out de posições
  nem o relógio fiscal.
- Repositórios de evidência/confirmação só são alcançados transitivamente pelos
  use-cases compostos.
