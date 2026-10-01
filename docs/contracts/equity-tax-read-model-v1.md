# Contract: `equity-tax-read-model-v1`

Fase 4G.2B.1 — read model do imposto de renda variável no endpoint mensal.

## Superfície

Campo aditivo `equity` em `GET /api/v1/fiscal/monthly/:competence/liability`
(inalterado para os demais campos; FII inalterado).

## Campos por categoria (`equity.normal`, `equity.dayTrade`)

Existentes (4G.2A): `status`, `reasonCode`, `grossSales`, `threshold`,
`exemptionStatus`, `matchedQuantity`, `currentResult`, `openingLoss`, `lossAdded`,
`lossConsumed`, `closingLoss`, `taxableBaseBeforeRate`, `electionStatus`.

Aditivos (4G.2B.1):

- `taxRate` — alíquota server-side (`15` / `20`)
- `grossTax`
- `irrfOpening`, `irrfCurrent`, `irrfUsed`, `irrfClosing`
- `irrfTerminalStatus` — `AVAILABLE_FOR_ANNUAL_ADJUSTMENT` | `AVAILABLE_FOR_RESTITUTION` | `null`
- `netTaxBefore6015Aggregation`
- `ruleId`, `ruleVersion`

Todos os valores financeiros são **strings decimais exatas** (nunca `number`).

## Estados

- `BLOCKED`: nenhuma conclusão fiscal autoritativa é apresentada; `grossTax`,
  `irrf*` e `netTaxBefore6015Aggregation` são `"0"` e `irrfTerminalStatus` é
  `null`; `reasonCode` explica (ex.: `INCOMPLETE_WITHHOLDING_CLASSIFICATION`).
- `PARTIAL`: `ELECTION_REQUIRED` (núcleo 4G.2A).

## Semântica "não é DARF final"

`netTaxBefore6015Aggregation` é o imposto líquido **da categoria**. Não é o valor
final do DARF; a consolidação no código 6015 é etapa posterior (4G.2C+).

## Fronteira de ano

Dezembro residual: normal → `AVAILABLE_FOR_ANNUAL_ADJUSTMENT`, day trade →
`AVAILABLE_FOR_RESTITUTION`. Janeiro: `irrfOpening = "0"`.

## Fora de escopo

6015, mínimo DARF, vencimento, atraso, Sicalc, IRPF anual, IA fiscal.
