# ADR-115 — Portfolio Benchmark Comparison Uses TWR

**Data:** 2026-09-21
**Status:** Aprovado
**Fase:** 3F

## Contexto

A carteira tem dois retornos: `TWR` (isola o efeito de mercado) e `XIRR` (pondera o timing do dinheiro).
É preciso escolher um para comparar com o benchmark.

## Decisão

- A comparação usa **exclusivamente o TWR** da carteira, no mesmo período do benchmark.
- A diferença é `differencePercentagePoints = portfolioTwr - benchmarkReturn`, em **pontos percentuais**.
- Calculada **no servidor** (`calculateExcessReturn`), decimal exato, nunca no cliente.
- **XIRR permanece visível, porém separado** — nunca é usado na comparação.
- O termo "alpha" é proibido; usa-se "Diferença vs. <benchmark> (p.p.)".

## Consequências

- A UI exibe TWR e XIRR em cartões distintos, com notas explicativas próprias.
