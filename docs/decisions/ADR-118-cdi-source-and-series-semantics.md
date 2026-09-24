# ADR-118 — CDI Source and Series Semantics

**Data:** 2026-09-21
**Status:** Aprovado
**Fase:** 3G

## Contexto

Antes de qualquer matemática, é obrigatório provar **o que a fonte fornece**: instituição, endpoint,
código da série, unidade, periodicidade e calendário. Um valor `13.65` pode significar `13,65% a.a.` e
não `13,65% no dia`.

## Decisão

Fonte canônica auditada do CDI:

| Item                  | Valor                                                            |
| --------------------- | ---------------------------------------------------------------- |
| Instituição           | Banco Central do Brasil (BCB)                                    |
| Endpoint              | `api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados`                 |
| Código da série (SGS) | `12`                                                             |
| Nome oficial          | `Taxa de juros - CDI`                                            |
| Periodicidade         | diária, **dias úteis**                                           |
| Unidade               | `DAILY_PERCENT` (`% ao dia`)                                     |
| Calendário            | apenas dias úteis publicados; sábados/domingos/feriados ausentes |
| Data                  | civil `LocalDate` (`YYYY-MM-DD`)                                 |
| Credenciais           | nenhuma (API pública)                                            |

- O adapter é explicitamente nomeado `BcbRateBenchmarkDataProvider` (`provider: 'BCB'`), nunca um
  `GenericRateProvider`.
- O código de série (`12`) é **metadado** (`providerSeriesCode`), nunca identidade canônica.
- A unidade é **explícita** na observação (`unit: 'DAILY_PERCENT'`); nenhum número trafega sem unidade.
- Verificação real: `2026-01-02 → 0.055131` e `2026-09-01 → 0.051660` (% a.d.); `2026-09-07`
  (Independência) ausente, confirmando o tratamento de feriados pelo BCB.
- DTOs do BCB (`{ data, valor }`) nunca vazam; datas em `dd/mm/yyyy` são convertidas para `LocalDate`.

## Consequências

- A semântica da série é provada e documentada; qualquer suposição de "taxa anualizada" está proibida.
- Selic não é implementada nesta fase (ver ADR de escopo/Selic no relatório 3G).
