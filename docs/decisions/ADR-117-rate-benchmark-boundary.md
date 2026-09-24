# ADR-117 — Rate Benchmark Boundary (`PRICE_INDEX != RATE_SERIES`)

**Data:** 2026-09-21
**Status:** Aprovado
**Fase:** 3G

## Contexto

A Fase 3F implementou benchmarks por nível de índice (`PRICE_INDEX`), onde
`return = endLevel / startLevel - 1`. O CDI não é um índice de preço: é uma **série de taxas** publicada
diariamente. Calcular `end / start - 1` sobre CDI produziria um número sem significado.

## Decisão

- `BenchmarkType` passa a ter duas famílias explícitas: `PRICE_INDEX` e `RATE_SERIES`.
- `IBOV` permanece `PRICE_INDEX`; `CDI` é `RATE_SERIES`.
- Cada família tem contrato, provider e função de cálculo próprios:
  - `PRICE_INDEX` → `BenchmarkDataProvider` → `calculateBenchmarkReturn`.
  - `RATE_SERIES` → `RateBenchmarkDataProvider` → `calculateRateBenchmarkReturn`.
- O engine recusa cruzamento de tipos: `calculateBenchmarkReturn` rejeita `RATE_SERIES` e
  `calculateRateBenchmarkReturn` rejeita `PRICE_INDEX`, ambos com `UnsupportedBenchmarkTypeError`.
- A camada de aplicação roteia por `BENCHMARK_DEFINITIONS[id].type`, nunca por `if (id === 'CDI')`.
- `PRICE_INDEX`/`IBOV` permanece intacto (regressão coberta por testes).

## Consequências

- Novas séries de taxas entram pela mesma fronteira sem tocar no cálculo de índice de preço.
- Fica impossível tratar CDI como índice por engano.
