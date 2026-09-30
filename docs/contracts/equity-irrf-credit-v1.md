# Contract: `equity-irrf-credit-v1`

Fase 4G.2B — pools de crédito de IRRF de renda variável, isolados por categoria.

## Alíquotas de IRRF (congeladas)

| Categoria          | Alíquota   | Fundamento                                                          |
| ------------------ | ---------- | ------------------------------------------------------------------- |
| `EQUITY_NORMAL`    | **0,005%** | Lei nº 11.033/2004, art. 2º, §1º, IV; IN RFB nº 1.585/2015, art. 63 |
| `EQUITY_DAY_TRADE` | **1%**     | IN RFB nº 1.585/2015, art. 65, caput                                |

## Pools

| Categoria          | poolId                  | Estado terminal de ano            |
| ------------------ | ----------------------- | --------------------------------- |
| `EQUITY_NORMAL`    | `EQUITY_NORMAL_IRRF`    | `AVAILABLE_FOR_ANNUAL_ADJUSTMENT` |
| `EQUITY_DAY_TRADE` | `EQUITY_DAY_TRADE_IRRF` | `AVAILABLE_FOR_RESTITUTION`       |

Não existe pool genérico de 6015. **Mesmo código de receita ≠ mesmo pool de IRRF.**

## Aplicação mensal

```
available = irrfOpening + irrfCurrent
used      = min(available, grossTax)   // 0 se grossTax = 0
closing   = available - used
netTax    = grossTax - used
```

Invariantes: `used <= available`, `used <= grossTax`, `closing >= 0`,
`netTax >= 0`.

## Segregação entre categorias

- IRRF normal **nunca** reduz day trade nem FII.
- IRRF day trade **nunca** reduz normal nem FII.
- FII permanece inteiramente fora destes pools.

## Carry e fronteira de ano

- Dentro do mesmo ano civil: `irrfOpening(M) = irrfClosing(M-1)` na mesma categoria.
- Em dezembro, o saldo residual é **terminal**: transita para o estado de ano
  (`AVAILABLE_FOR_ANNUAL_ADJUSTMENT` / `AVAILABLE_FOR_RESTITUTION`).
- **Não há carry automático para janeiro**: `irrfOpening(janeiro) = 0`.

## Proteção contra uso duplo

Cada evidência de retenção carrega `fingerprint` estável; a mesma evidência
reproduzida não duplica crédito.

## Fonte do IRRF

O IRRF vem exclusivamente de entrada canônica explícita com `category`
(`EQUITY_NORMAL`/`EQUITY_DAY_TRADE`) e `amount`. Nunca é inferido do imposto
devido. Ausência de entrada é tratada como ausência (não estimada).
