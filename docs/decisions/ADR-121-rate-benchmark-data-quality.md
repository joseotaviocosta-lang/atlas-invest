# ADR-121 — Rate Benchmark Data Quality

**Data:** 2026-09-21
**Status:** Aprovado
**Fase:** 3G

## Contexto

A série do CDI só publica dias úteis. É preciso distinguir **feriado legítimo** de **observação
indevidamente ausente** e jamais tratar ausência como taxa zero.

## Decisão

Estados de disponibilidade:

| Status        | Significado                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------- |
| `AVAILABLE`   | ≥ 1 observação no intervalo e cobertura esperada satisfeita                                  |
| `PARTIAL`     | `expectedObservationDates` fornecido e a série cobre estritamente menos dias úteis esperados |
| `UNAVAILABLE` | nenhuma observação no intervalo; `returnPercentage = null`                                   |

- **Nunca** tratar observação ausente como `0%`.
- **Nunca** marcar `PARTIAL` apenas porque sábado/domingo não possui taxa.
- **Limitação 3G:** sem um calendário oficial de dias úteis integrado, a fonte não permite distinguir
  feriado de ausência indevida. Portanto o servidor **não inventa calendário**: quando
  `expectedObservationDates` não é informado, o status é `AVAILABLE` ou `UNAVAILABLE`. O status `PARTIAL`
  é suportado pelo contrato e pelo engine (via `expectedObservationDates`), pronto para um calendário
  autoritativo futuro.
- Na comparação com a carteira, um valuation parcial da carteira propaga `PARTIAL` para o comparativo,
  que é rotulado **"Comparação parcial"** e nunca exibido como completo.
- `UNAVAILABLE` nunca é exibido como `0%`; usa-se travessão `—` ou mensagem explícita.

## Consequências

- Honestidade visual preservada: o usuário nunca vê um retorno de CDI fabricado.
- A evolução para detecção real de gaps fica isolada no engine, sem mudar o contrato HTTP.
