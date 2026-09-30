# Contract: `equity-monthly-fiscal-read-v1`

Fase 4G.2A.1b.1 — leitura mensal fiscal de renda variável (ações) derivada do
livro-razão real e de replay histórico determinístico, com eleição persistida.

## Superfície

Campo aditivo `equity` no read model existente de
`GET /api/v1/fiscal/monthly/:competence/liability`. A resposta de FII existente
permanece inalterada; `equity` é irmão aditivo.

## Fontes de dados reais

- **Ledger**: transações canônicas (`BUY`/`SELL`) do livro-razão imutável. Posições
  atuais **nunca** são fonte da verdade.
- **Metadados de ativo**: `AssetType` canônico → `resolveTaxAssetCategory` (nunca
  por ticker).
- **Instituição**: `account.institutionId` (identidade de intermediário).
- **Custo base**: disposições realizadas canônicas do Portfolio Engine
  (`costBasisRemoved`), nunca recalculado localmente.
- **Eleições**: revisão corrente persistida por competência.

## Mapeamento e classificação

- Somente `BUY`/`SELL` com `assetId` entram no motor.
- `BRAZILIAN_EQUITY` (STOCK) → `ELIGIBLE_EQUITY`.
- Categorias conhecidas fora do escopo (FII, ETF, BDR, FIXED_INCOME) →
  `UNSUPPORTED_ASSET` (excluídas; não bloqueiam nem entram no threshold).
- Categoria `UNKNOWN` → `UNKNOWN_CLASSIFICATION` → mês `BLOCKED`.
- Ordenação canônica: `(tradeDate ASC, createdAt ASC, id ASC)`; o `sequence`
  do matcher é derivado dessa ordem (nunca ordem de inserção no banco).

## Day trade

- Reutiliza `classifyEquityTradesForTax` (matcher congelado). Sem reimplementação.
- Agrupamento por `(assetId, institutionId, tradeDate)`. Contas distintas do
  **mesmo** intermediário compartilham a identidade de instituição e podem casar;
  intermediários distintos nunca casam.
- Custo do day trade vem do **leg de compra casado** (nunca do custo médio de
  estoque pré-existente).

## Custo base normal

- Para legs normais, o custo é a disposição realizada canônica rateada por
  quantidade: `costBasisRemoved × (legQuantity / sellQuantity)` com aritmética
  decimal exata (`Money`), sem ponto flutuante.
- Apenas a quantidade residual normal recebe o custo; a parcela day trade usa o
  leg de compra casado.

## Replay histórico

- Replay cronológico de competências relevantes até a solicitada.
- `openingNormalLoss(M) = closingNormalLoss(M-1)` e
  `openingDayTradeLoss(M) = closingDayTradeLoss(M-1)`; buckets nunca se cruzam.
- Eleição é injetada competência a competência; ausente → `ELECTION_REQUIRED`.
- Alterar a eleição em M afeta M e competências seguintes; **nunca** altera M-1.

## Fail-closed

| Condição                               | Status  | reasonCode                         |
| -------------------------------------- | ------- | ---------------------------------- |
| Ativo com classificação desconhecida   | BLOCKED | `UNKNOWN_ASSET_TAX_CLASSIFICATION` |
| Instituição ausente                    | BLOCKED | `MISSING_INSTITUTION_IDENTITY`     |
| Custo base canônico ausente/incompleto | BLOCKED | `MISSING_CANONICAL_COST_BASIS`     |
| Falha do matcher                       | BLOCKED | `EQUITY_MATCHER_FAILED`            |
| Competência anterior bloqueada         | BLOCKED | `PRIOR_COMPETENCE_BLOCKED`         |

Quando `BLOCKED`, `exemptionStatus` é `NOT_APPLICABLE` (nenhuma isenção é
afirmada) e nenhum prejuízo fabricado é transportado.

## Read model (`data.equity`)

```
{
  competence, status, reasonCode, ruleVersions,
  normal:    { status, reasonCode, grossSales, threshold, exemptionStatus,
               matchedQuantity(null), currentResult, openingLoss, lossAdded,
               lossConsumed, closingLoss, taxableBaseBeforeRate, electionStatus },
  dayTrade:  { … matchedQuantity … },
  compensationElection: { required, status, currentValue, version, fingerprint }
}
```

- Todos os valores financeiros são strings decimais exatas; nunca `number`.
- Sem atividade → modelo estável de zeros (`status: COMPLETE`, `grossSales: "0"`,
  `exemptionStatus: EXEMPT`), sem obrigação fabricada.
- Determinístico e idempotente: mesma entrada ⇒ mesma saída; leitura sem escrita.

## Fora de escopo

IRRF, composição 6015, mínimo DARF, DARF de ações, UI web/mobile.
