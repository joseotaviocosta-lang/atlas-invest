# Contrato: FiscalEvent v1 (Fase 4A)

Derivação determinística de uma transação canônica imutável em um evento fiscal auditável.
Um `FiscalEvent` é **derivado**, nunca editável diretamente (ADR-236).

## Identidade

- `id`: `fev:<projectionVersion>:<sourceTransactionId>` — determinístico e estável.
- `sourceTransactionId`: id da transação canônica de origem (rastreabilidade).
- `projectionVersion`: versão da semântica de projeção (`fiscal-projection-v1`).

## Campos

| Campo                   | Tipo           | Descrição                                       |
| ----------------------- | -------------- | ----------------------------------------------- |
| `id`                    | string         | Identidade determinística derivada              |
| `sourceTransactionId`   | string         | Transação de origem                             |
| `portfolioId`           | string         | Carteira de origem                              |
| `accountId`             | string         | Conta de custódia                               |
| `assetId?`              | string         | `AssetId` canônico (nunca o ticker)             |
| `sourceTransactionType` | string         | Tipo de transação canônico (16 tipos)           |
| `economicDate`          | `YYYY-MM-DD`   | Data econômica civil (imune a fuso)             |
| `competence`            | `YYYY-MM`      | Competência civil derivada da data econômica    |
| `eventType`             | enum           | Ver abaixo                                      |
| `relevance`             | enum           | Ver abaixo                                      |
| `taxAssetCategory`      | enum           | Categoria fiscal do ativo                       |
| `currency`              | string         | Moeda explícita; nunca presume BRL              |
| `quantity?`             | string decimal | Quando aplicável                                |
| `unitPrice?`            | Money          | Quando aplicável                                |
| `proceeds?`             | Money          | Valor líquido de venda (bruto − custos)         |
| `amount?`               | Money          | Provento/amortização/despesa                    |
| `costBasis?`            | Money          | Base de custo canônica (quando fornecida)       |
| `realizedResult?`       | Money          | Resultado realizado canônico (quando fornecido) |
| `qualityIssues`         | string[]       | Issues de completude aplicáveis                 |
| `projectionVersion`     | string         | Versão da projeção                              |

## Event Types

`PURCHASE`, `SALE`, `INCOME`, `TRANSFER_IN`, `TRANSFER_OUT`, `CORPORATE_ACTION`,
`AMORTIZATION`, `EXPENSE`, `CASH_FLOW`, `WITHHOLDING`, `OTHER`.

## Relevance

`TAXABLE`, `NON_TAXABLE`, `INFORMATIONAL`, `DEFERRED`, `UNKNOWN`.

## Mapeamento canônico (16 tipos)

| Transação     | Event Type       | Relevance     |
| ------------- | ---------------- | ------------- |
| BUY           | PURCHASE         | INFORMATIONAL |
| SELL          | SALE             | TAXABLE       |
| DIVIDEND      | INCOME           | TAXABLE       |
| JCP           | INCOME           | TAXABLE       |
| FII_INCOME    | INCOME           | TAXABLE       |
| BONUS         | CORPORATE_ACTION | NON_TAXABLE   |
| SPLIT         | CORPORATE_ACTION | NON_TAXABLE   |
| REVERSE_SPLIT | CORPORATE_ACTION | NON_TAXABLE   |
| SUBSCRIPTION  | PURCHASE         | INFORMATIONAL |
| AMORTIZATION  | AMORTIZATION     | INFORMATIONAL |
| TRANSFER_IN   | TRANSFER_IN      | NON_TAXABLE   |
| TRANSFER_OUT  | TRANSFER_OUT     | NON_TAXABLE   |
| DEPOSIT       | CASH_FLOW        | NON_TAXABLE   |
| WITHDRAWAL    | CASH_FLOW        | NON_TAXABLE   |
| FEE           | EXPENSE          | INFORMATIONAL |
| TAX           | EXPENSE          | INFORMATIONAL |

## Invariantes

1. Transferências **nunca** são compra ou venda.
2. `DIVIDEND`, `JCP` e `FII_INCOME` permanecem distintos (`sourceTransactionType`).
3. Venda sem base de custo canônica emite `UNKNOWN_COST_BASIS`; nunca assume custo zero.
4. A projeção é determinística e invariante à ordem de entrada.
5. Nenhum valor em ponto flutuante IEEE-754.
