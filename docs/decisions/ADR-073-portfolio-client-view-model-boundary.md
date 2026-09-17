# ADR-073: Portfolio Client View Model Boundary and Zero Client Math

## Status

Accepted

## Context

Para renderizar os dados patrimoniais retornados pela `Portfolio Read API v1`, existia o risco de espalhar lógica de formatação, agregação e parsing financeiro diretamente dentro dos componentes React e React Native, ou pior, de recalcular grandezas financeiras no cliente (ex: `quantity * averageCost` ou soma com ponto flutuante).

## Decision

1. **Camada Pura de View Model (`PortfolioOverviewViewModel`):**
   - Criada a função pura e agnóstica de framework `mapToPortfolioOverviewViewModel` no pacote `@atlas/ui`.
   - Essa função recebe o DTO da API (`PortfolioStateDto`), metadados da carteira e dicionário opcional de contas, produzindo um modelo de apresentação imutável e pronto para renderização.
2. **Invariante de Zero Client-Side Financial Calculation:**
   - O cliente **nunca** multiplica quantidade por preço médio para recalcular custo total.
   - O cliente **nunca** calcula ganho/prejuízo ou rendimentos acumulados.
   - Todas as grandezas financeiras vêm diretamente do DTO da API (calculadas pelo Portfolio Engine) e são apenas formatadas de forma segura com BigInt via `@atlas/ui` (`formatCurrency`, `formatQuantity`, `formatPercentage`).
3. **Custo Incompleto Nulo:**
   - Valores com `costBasisStatus === 'INCOMPLETE'` são formatados como `—` (travessão), jamais como `0` ou `R$ 0,00`.

## Consequences

- Total desacoplamento entre os componentes de interface (Web/Mobile) e as peculiaridades estruturais do DTO da API.
- Impossibilidade de desvios matemáticos causados por arredondamentos em ponto flutuante IEEE-754 no navegador ou dispositivo móvel.
