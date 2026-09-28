# Contrato: TaxCategoryMonthlyResult v1 (Fase 4B)

Resultado por categoria/moeda dentro de uma competência. Cada valor é decimal
exato; a tributação é decidida exclusivamente pela regra efetiva.

## Campos

| Campo                                                                         | Descrição                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------ |
| `category` / `currency`                                                       | Categoria fiscal + moeda (sem agregação cruzada) |
| `status`                                                                      | `COMPLETE                                        | PARTIAL | BLOCKED` |
| `ruleVersion` / `ruleSetStatus`                                               | Regra efetiva resolvida                          |
| `grossSales`                                                                  | Soma dos valores líquidos de venda               |
| `realizedResult`                                                              | Resultado realizado canônico (Portfolio Engine)  |
| `taxableRealizedResult`                                                       | Apenas a parcela positiva (ganho)                |
| `exemptionApplied`                                                            | Isenção por limiar de vendas (regra)             |
| `taxableBaseBeforeLosses`                                                     | Base antes de prejuízos                          |
| `openingLossBalance` / `lossApplied` / `lossGenerated` / `closingLossBalance` | Compensação de prejuízo da categoria             |
| `taxableBaseAfterLosses`                                                      | Base após prejuízos                              |
| `ratePercentage`                                                              | Alíquota da regra (string decimal exata)         |
| `taxBeforeWithholding`                                                        | Imposto antes de retenções                       |
| `withholdingAvailable` / `withholdingApplied`                                 | Retenção canônica aplicada                       |
| `taxDue`                                                                      | Somente quando `COMPLETE`; senão `null`          |
| `qualityIssues` / `trace`                                                     | Pendências e trilha da categoria                 |

## Invariantes

1. Compensação de prejuízo é isolada por categoria (ADR-243).
2. Prejuízo não gera base/tributo negativo.
3. `taxDue` só existe sob regra `VERIFIED` e dados completos.
4. Sem `parseFloat`/`Number()`/`Math.round` em caminhos fiscais.
