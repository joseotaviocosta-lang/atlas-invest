# ADR-109 — Performance Period Selection

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3E

## Contexto

Usuário precisa comparar períodos.

## Decisão

Presets: `1M`, `3M`, `6M`, `YTD`, `1Y`, `Desde o início`, `Personalizado`. `Custom` valida `start <= end` e `end <= today` com `LocalDate` civil (sem timezone). `Default` `1Y` (se carteira <1Y, usa `INCEPTION`). `URL state` `?period=1Y` ou `?startDate&endDate` deep-link, `queryKey` `['portfolio-performance', id, start, end]` sem colisão.

## Consequências

- `getPeriodDates` puro, `performanceQueryKey` inclui `period`.
- `view-model` e `web/mobile` testes cobrem `1M`..`CUSTOM`, `invalid period` e `future date`.
