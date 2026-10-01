# Contract: `equity-6015-composition-v1`

Fase 4G.2C — composição da obrigação mensal única do código de receita **6015** a
partir dos resultados fiscais por categoria (FII, operações comuns, day trade).

## Objetivo

Os resultados por categoria permanecem internamente distintos para prejuízos,
pools de IRRF, rastreabilidade e imposto líquido de categoria. A **obrigação de
pagamento**, porém, é composta por código de receita: as três categorias são
agregadas em um único valor mensal `6015`.

```
FII (net tax)
+ EQUITY_NORMAL (netTaxBefore6015Aggregation)
+ EQUITY_DAY_TRADE (netTaxBefore6015Aggregation)
= composição 6015 (valor mensal único)
```

## Categorias e ordem canônica

| Ordem | Categoria          | Rótulo           | Origem autoritativa                       |
| ----- | ------------------ | ---------------- | ----------------------------------------- |
| 1     | `FII`              | FII              | `MonthlyTaxLiability` (4A/4B, regra 4B.5) |
| 2     | `EQUITY_NORMAL`    | Operações comuns | `netTaxBefore6015Aggregation` (4G.2B)     |
| 3     | `EQUITY_DAY_TRADE` | Day trade        | `netTaxBefore6015Aggregation` (4G.2B)     |

A composição **não recalcula** alíquotas, bases, prejuízos, IRRF, isenção ou
election. Ela apenas soma valores de categoria já apurados no servidor.

## Identidade da obrigação

Invariante: para o mesmo `taxSubjectId` + `competence` + `6015` existe **uma**
obrigação composta — nunca uma por categoria.

## Estágios (fronteiras congeladas)

1. **Componentes** — FII + normal + day trade, com `netCategoryTax` decimal
   exato (`>= 0`).
2. **Agregação 6015** — soma exata; status `COMPLETE` / `PARTIAL` / `BLOCKED` /
   `NO_ACTIVITY`.
3. **Regra de DARF mínimo (4E)** — aplicada **após** a agregação por código de
   receita, sobre o total mensal (nunca por categoria).
4. **Carry-forward (4E)** — por código de receita/pagamento, após a agregação.
5. **Vencimento (4C)** — registro oficial direto por `(revenueCode, competence)`.
6. **Atraso (4D)** — sem cálculo de multa/juros na composição.
7. **DARF/Sicalc (4F)** — handoff interativo oficial, sem geração local.

## Regras de falha fechada

- Componente `BLOCKED` ⇒ composição `BLOCKED`; nenhum valor final é apresentado.
- Componente `PARTIAL` ⇒ composição `PARTIAL`; nenhum total autoritativo.
- Componente negativo ⇒ `BLOCKED` (`NEGATIVE_COMPONENT`); uma categoria nunca
  reduz outra.
- Moedas divergentes ⇒ `BLOCKED` (`CURRENCY_MISMATCH`); sem FX.
- Atividade em categoria fora do conjunto composto (FII + equity brasileira) ⇒
  `BLOCKED` (`UNSUPPORTED_ACTIVITY`).

`null` significa indisponível; nunca é convertido em `"0"`.

## Precisão decimal

Todos os valores são strings decimais exatas (`Money`/`Decimal.js` no engine).
Zero ponto flutuante IEEE-754 em qualquer caminho financeiro.

## Proteção contra duplicação

Cada componente carrega `sourceFingerprint` estável; a composição carrega um
`fingerprint` canônico que muda deterministicamente quando qualquer categoria de
origem muda. Reexecutar o mesmo replay não duplica a obrigação.

## Fronteiras de autoridade

- O **servidor** compõe; Web/Mobile apenas formatam (`formatCurrency`).
- Nenhum cliente soma FII + normal + day trade.
- Nenhum segundo motor de DARF, mínimo, vencimento ou atraso é criado; a
  composição reutiliza 4C/4D/4E/4F.
