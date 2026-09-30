# Contract: `equity-production-tax-rules-v1`

Fase 4G.2B — regras de produção para tributação de renda variável (ações).

## Alíquotas (congeladas)

| Categoria          | Alíquota | Fundamento                      |
| ------------------ | -------- | ------------------------------- |
| `EQUITY_NORMAL`    | **15%**  | Lei nº 11.033/2004, art. 2º, II |
| `EQUITY_DAY_TRADE` | **20%**  | Lei nº 11.033/2004, art. 2º, I  |

## Identidade das regras

| Campo         | Normal             | Day trade             |
| ------------- | ------------------ | --------------------- |
| ruleId        | `BR-EQUITY-NORMAL` | `BR-EQUITY-DAY-TRADE` |
| version       | `1.0.0`            | `1.0.0`               |
| effectiveFrom | `2015-09-01`       | `2015-09-01`          |

As regras vivem em `EQUITY_PRODUCTION_TAX_RULES` (registro categórico próprio do
motor), separado do registro 4A/4B keyed por `TaxAssetCategory`, para manter a
regra de FII e sua resolução inalteradas.

## Imposto bruto

- `grossTax = taxableBaseBeforeRate × rate%` (decimal exato).
- Base `<= 0` → `grossTax = 0`.
- Mês isento (base 0 por isenção) → `grossTax = 0`; o IRRF não é consumido.

## Arredondamento

O motor não arredonda: usa a precisão decimal operacional existente (40 dígitos,
`ROUND_HALF_UP`). O arredondamento para 2 casas ocorre **apenas na exibição**
(`@atlas/ui`).

## Fora de escopo

Composição 6015, mínimo DARF, vencimento, atraso e Sicalc.
