# ADR-112 — Benchmark Engine Boundary

**Data:** 2026-09-21
**Status:** Aprovado
**Fase:** 3F

## Contexto

Comparar a carteira com um índice exige uma camada que saiba o que é um benchmark, como obter seus dados e
como calcular seu retorno — sem contaminar o Portfolio Engine (ledger) nem a camada de valuation.

## Decisão

Criar `@atlas/benchmark-engine` (`0.1.0`, evoluído para `0.2.0` na Fase 3G) como pacote puro e
determinístico para a matemática de benchmark, contendo também adapters de provedores isolados.

- O engine **não** conhece ledger, carteira, TWR ou XIRR.
- Os caminhos de cálculo (`calculateBenchmarkReturn`, `calculateRateBenchmarkReturn`,
  `calculateExcessReturn`) são **zero I/O**: sem `fetch`, sem persistência, sem rede.
- Adapters (`YahooBenchmarkDataProvider`, `StooqBenchmarkDataProvider`, `BcbRateBenchmarkDataProvider`)
  encapsulam a rede e nunca vazam tipos externos.
- `portfolio-engine` **nunca** importa `benchmark-engine`.

## Consequências

- Matemática testável com `DecimalValue`/`LocalDate` exatos e `InMemory` providers.
- A camada de aplicação (`GetPortfolioPerformanceUseCase`) orquestra provider + engine, sem matemática própria.
