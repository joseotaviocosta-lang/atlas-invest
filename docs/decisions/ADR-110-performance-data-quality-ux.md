# ADR-110 — Performance Data Quality UX

**Data:** 2026-09-20
**Status:** Aprovado
**Fase:** 3E

## Contexto

`TWR/XIRR` podem ser `PARTIAL` ou `UNAVAILABLE`.

## Decisão

- `AVAILABLE`: mostra `TWR`/`XIRR` normalmente.
- `PARTIAL`: banner `Dados parciais` + `Alguns preços históricos não estavam disponíveis. Os resultados abaixo usam apenas os dados que puderam ser reconstruídos.` (não vermelho alarmista).
- `UNAVAILABLE`: `Performance indisponível para este período.` + `—` não `0%`.
- `null metric` → `—` (`twr: null` → `—`), nunca `0,00%`.

## Consequências

- `view-model` mapeia `status`→`statusLabel`/`statusColor`, `web/mobile` mostram `Badge` por `dataAvailability`.
