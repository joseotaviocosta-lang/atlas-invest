# ADR-113 — Benchmark Data Source, Cache and Provider Isolation

**Data:** 2026-09-21
**Status:** Aprovado
**Fase:** 3F

## Contexto

Benchmarks vêm de provedores externos com formatos distintos. É necessário isolar o formato externo,
definir cache e nunca depender de rede em testes.

## Decisão

- O contrato canônico é `BenchmarkDataProvider` (`getObservation`, `getObservations`) e
  `RateBenchmarkDataProvider` (`getRateObservation`, `getRateObservations`).
- Apenas o contrato canônico e erros normalizados saem do adapter. DTOs externos
  (`YahooFinanceQuote`, `StooqCsvRow`, `{ data, valor }` do BCB) **nunca** vazam.
- Provedores reais: `YahooBenchmarkDataProvider` (`^BVSP`), `StooqBenchmarkDataProvider` (`^BVSP`),
  `BcbRateBenchmarkDataProvider` (SGS 12).
- `InMemoryBenchmarkDataProvider` / `InMemoryRateBenchmarkDataProvider` são determinísticos;
  **CI nunca chama rede**.
- Cache dedicado e separado por família: `InMemoryBenchmarkCache` (`benchmarkId::date`) e
  `InMemoryRateBenchmarkCache` (`benchmarkId::from::to`). Caches de `IBOV` e `CDI` **nunca** se misturam.

## Consequências

- Trocar de provedor não afeta o engine nem a API.
- A resposta HTTP não expõe símbolo de provedor, código de série ou nome de classe do adapter.
