# Contrato: FiscalDataQuality v1 (Fase 4A)

Qualidade de dados fiscal é cidadã de primeira classe. Desconhecido **nunca** vira zero
(ADR-239).

## Status

| Status     | Significado                                            |
| ---------- | ------------------------------------------------------ |
| `EMPTY`    | Sem eventos fiscais na competência (zero válido)       |
| `COMPLETE` | Todos os dados necessários presentes                   |
| `PARTIAL`  | Issues de completude presentes; cálculo não conclusivo |
| `BLOCKED`  | Impossível apurar (ex.: sem regra vigente)             |

## Issues

| Issue                        | Significado                                                               |
| ---------------------------- | ------------------------------------------------------------------------- |
| `UNKNOWN_COST_BASIS`         | Base de custo de aquisição indisponível; venda não produz ganho fabricado |
| `UNKNOWN_ASSET_TAX_CATEGORY` | Categoria fiscal do ativo não determinada                                 |
| `UNSUPPORTED_CURRENCY`       | Moeda sem tratamento fiscal completo na 4A (ex.: USD)                     |
| `MISSING_RULE_SET`           | Nenhum conjunto de regras vigente para a competência                      |
| `INCOMPLETE_HISTORY`         | Histórico de aquisição ausente/incompleto                                 |
| `MISSING_PROCEEDS`           | Valor de venda indisponível quando necessário                             |

Apenas issues efetivamente aplicáveis são emitidas.

## Semântica Null vs Zero

- `null` = indisponível.
- `"0"` = zero real observado.
- Desconhecido jamais é convertido em `"0"`.

## Invariantes

1. Falha fechada: dados incompletos não produzem resultado tributário conclusivo.
2. Custo desconhecido nunca é tratado como zero.
3. Categoria `UNKNOWN` nunca recebe tratamento de equity.
4. Moedas distintas não são mescladas sem FX explícito.
5. O usuário deve poder entender **por que** a apuração não prosseguiu.
