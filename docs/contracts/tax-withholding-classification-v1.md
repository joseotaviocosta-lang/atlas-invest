# Contract: `tax-withholding-classification-v1`

Fase 4G.2B.0 — classificação canônica de retenção (IRRF) de renda variável.

## Duas dimensões distintas

- **`category` (`TaxAssetCategory`)** — categoria ampla do ativo
  (`BRAZILIAN_EQUITY`, `FII`, `ETF`, `BDR`, `FIXED_INCOME`, `UNKNOWN`). Permanece
  inalterada.
- **`withholdingCategory`** — classificador explícito do pool de IRRF.

`TaxAssetCategory` **não** é classificador de pool de IRRF.

## Valores de `withholdingCategory`

- `EQUITY_NORMAL` → pool `EQUITY_NORMAL_IRRF`
- `EQUITY_DAY_TRADE` → pool `EQUITY_DAY_TRADE_IRRF`

## Regra semântica

- `category = BRAZILIAN_EQUITY` **exige** `withholdingCategory` explícito.
- Categorias não-equity (FII/ETF/BDR/renda fixa) **não** aceitam
  `withholdingCategory`.

## Fail-closed

- Ausência do discriminador em `BRAZILIAN_EQUITY` → `400` na criação e
  `BLOCKED`/`UNKNOWN` na leitura/consumo; **nunca** assume `EQUITY_NORMAL`.
- Valor desconhecido/inválido → `400` / fail-closed.
- Nunca é tratado como IRRF zero.

## Sem inferência

`sourceReference` é texto livre e **nunca** é parseado para classificação fiscal.
Não se infere a categoria a partir de valor, alíquota, descrição ou presença de
transação. O discriminador é dado de origem explícito.

## Legado

Registros existentes sem discriminador permanecem **legíveis** e são expostos com
`withholdingCategory: null` (incompleto/bloqueante). Sem backfill destrutivo.

## Persistência

`tax_withholding_input_records.withholding_category` (nullable, aditiva).

## Fingerprint

A identidade semântica inclui o discriminador **quando presente**. Registros
legados (sem discriminador) preservam o fingerprint histórico byte a byte; a
adição é uma extensão versionada implícita.

## Idempotência

Mesma entrada semântica → sem duplicata. Discriminador diferente na mesma
identidade de origem (`sourceType`+`sourceReference`) → **conflito explícito**,
nunca sobrescrita silenciosa.
