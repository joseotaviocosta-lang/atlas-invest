# ADR-119 — CDI Compounding

**Data:** 2026-09-21
**Status:** Aprovado
**Fase:** 3G

## Contexto

CDI é uma taxa diária. O retorno acumulado no período é obtido por **composição**, não por soma nem por
divisão de níveis.

## Decisão

```
dailyFactor        = 1 + rate/100   (unit = DAILY_PERCENT)
                   = rate           (unit = DAILY_FACTOR)
accumulatedFactor  = ∏ dailyFactor
returnPercentage   = (accumulatedFactor - 1) × 100
```

- Implementado em `calculateRateBenchmarkReturn`.
- Aritmética **exata** com `DecimalValue`; **proibido** `parseFloat`, `Number` e `Math.pow`.
- Como a fonte fornece fator/taxa diária, **não é necessário expoente fracionário** nem conversão de taxa
  anualizada.
- `ANNUAL_PERCENT` não é modelado: converter anual → diário exige convenção oficial inexistente para a
  série 12. Unidade desconhecida lança `UnsupportedRateUnitError` (nunca conversão silenciosa).
- Exemplo canônico: `1% + 1% = 2.01%` (não `2.00%`). Taxa zero → `0%`.
- Resultado congelado; entrada imutável; ordenação canônica por data.

## Consequências

- Sem deriva de ponto flutuante em séries longas (centenas de observações testadas).
- Impossível "somar taxas" ou "anualizar" acidentalmente.
