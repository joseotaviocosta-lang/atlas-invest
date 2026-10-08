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
2. Proibições específicas (sem proibição genérica `/Repository/`): o use-case
   **não importa de `@atlas/database`** (asserção exata
   `not.toMatch(/from\s+['"]@atlas\/database['"]/)`), não referencia tipos de
   linha/mapper (`HighIncomeEvidenceRow`, `TaxpayerConfirmationRow`), não chama
   primitivas de recomputação (`calculate*`, `buildAnnual*`, `replayPortfolio`) e
   não injeta diretamente um repositório de evidências/confirmações fiscais
   (`HIGH_INCOME_EVIDENCE_REPOSITORY`, `TAXPAYER_CONFIRMATION_REPOSITORY`).
3. O contrato do repositório de portfólios e os preditores de erro de
   persistência são consumidos por uma **porta voltada à aplicação**
   (`unified-annual.port.ts`: `UnifiedAnnualPortfolioPort`, `isEntityNotFound`,
   `isPersistenceFault`) — detecção estrutural por código de erro, nunca
   `instanceof` contra classes de `@atlas/database`. O token
   `PORTFOLIO_REPOSITORY` continua explicitamente permitido.
4. O módulo puro `annual-irpf/unified-annual-*.ts` não importa
   NestJS/Prisma/@atlas/database/React.

## Consequências

- A fronteira de orquestração é fiscalizada sem bloquear o fan-out de posições
  nem o relógio fiscal, e sem vazar tipos do pacote de persistência para o
  use-case.
- Repositórios de evidência/confirmação só são alcançados transitivamente pelos
  use-cases compostos.
