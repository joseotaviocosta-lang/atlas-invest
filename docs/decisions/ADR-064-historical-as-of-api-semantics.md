# ADR-064: Historical 'asOf' Point-in-Time Query Semantics

## Status

Accepted

## Context

Para auditoria contábil, declaração de imposto de renda e reconstituição histórica de posições, os usuários e sistemas integrados precisam consultar o estado da carteira exatamente como ela existia em qualquer data no passado (`asOf`).

A reconstituição deve refletir rigorosamente todos os eventos patrimoniais ocorridos até a data de corte (inclusive), desconsiderando quaisquer transações posteriores, de maneira idempotente e reprodutível.

## Decision

1. **Parâmetro `asOf` e Validação de Calendário Civil**:
   - Os endpoints `GET /state` e `GET /positions` aceitam o parâmetro de query opcional `asOf` no formato ISO `YYYY-MM-DD`.
   - A validação rejeita strings malformadas ou datas que não existam no calendário civil gregoriano (ex.: `2026-02-30`, `2025-04-31`) utilizando a classe de domínio `LocalDate.from(asOf)`, disparando HTTP `400 Bad Request` com código `PORTFOLIO.INVALID_AS_OF_DATE`.

2. **Corte Econômico Inclusivo**:
   - Ao processar uma query com `asOf`, o use case repassa a data de corte para o repositório (`findByPortfolioId(portfolioId, { endDate: asOfDate })`) e para as opções do motor (`replayPortfolio({ portfolioId, asOfDate })`).
   - Todos os eventos com `tradeDate <= asOfDate` são aplicados na ordem determinística padrão. Eventos com data posterior são estritamente omitidos do replay.

3. **Comportamento em Casos Limítrofes**:
   - **Antes da primeira transação**: Se `asOf` for anterior à data do primeiro evento da carteira, o endpoint retorna com sucesso um estado vazio (posições vazias, saldos zerados, sumários zerados e `processedTransactionCount = 0`).
   - **No futuro**: Se `asOf` for posterior a todas as transações cadastradas, o estado reproduz exatamente o estado atual acumulado de toda a carteira.

## Consequences

- **Positivas:**
  - Capacidade nativa de "viagem no tempo" patrimonial sem necessidade de backups históricos parciais ou tabelas de snapshot estático.
  - Otimização de I/O de banco de dados filtrando antecipadamente `trade_date <= :endDate` no nível da query SQL indexada.
- **Negativas:**
  - O corte temporal baseia-se na data de negociação (`tradeDate`).
