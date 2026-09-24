# ADR-120 — Rate Benchmark Period Boundaries

**Data:** 2026-09-21
**Status:** Aprovado
**Fase:** 3G

## Contexto

É necessário definir exatamente quais observações entram no cálculo do período, de forma determinística e
auditável.

## Decisão

Semântica fixada para `RATE_SERIES`: **`(startDate, endDate]`** — início **exclusivo**, fim **inclusivo**.

- A taxa publicada em `D` remunera o dia que se encerra em `D`; a observação de `startDate` é excluída e a
  de `endDate` é incluída.
- `startDate === endDate` → intervalo vazio → `UNAVAILABLE` (`observationCount = 0`).
- `startDate > endDate` → erro de período inválido.
- Virada de mês e de ano suportadas (datas civis `LocalDate`).
- Sábados/domingos/feriados sem observação **não** configuram falha de qualidade.
- Ordenação canônica `date ASC`; resultado invariante à ordem do array de entrada.

## Consequências

- O mesmo período sempre produz a mesma contagem e o mesmo fator acumulado.
- Cobertura explícita por testes de fronteira: um dia útil, dois dias úteis, sexta→segunda, virada de mês,
  virada de ano, `start = end`.
