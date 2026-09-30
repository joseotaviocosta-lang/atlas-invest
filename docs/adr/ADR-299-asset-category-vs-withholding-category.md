# ADR-299: Separar Categoria de Ativo de Categoria de Retenção (IRRF)

## Status

Aceito (Fase 4G.2B.0)

## Contexto

A evidência canônica de retenção (`TaxWithholdingInput`) expunha apenas
`category: TaxAssetCategory` (`BRAZILIAN_EQUITY`). Isso não distingue o pool de
IRRF de operações comuns (`EQUITY_NORMAL_IRRF`) do de day trade
(`EQUITY_DAY_TRADE_IRRF`), bloqueando a integração da Fase 4G.2B.

## Decisão

1. **Duas dimensões separadas**: `category` permanece a categoria ampla do ativo;
   `withholdingCategory` é o classificador explícito do pool de IRRF.
2. Valores: `EQUITY_NORMAL` | `EQUITY_DAY_TRADE`.
3. `category = BRAZILIAN_EQUITY` exige `withholdingCategory`; ausência/valor
   inválido falha fechado (nunca assume uma categoria nem trata como zero).
4. Categorias não-equity não aceitam o discriminador.
5. **Sem inferência**: `sourceReference` (texto livre) nunca é parseado para
   classificação fiscal.
6. **Persistência aditiva**: coluna nullable, sem backfill destrutivo; legado
   permanece legível com `null` (incompleto/bloqueante).
7. **Fingerprint**: o discriminador entra na identidade semântica quando presente;
   fingerprints legados são preservados.

## Consequências

- A classificação normal/day trade passa a ser dado de origem explícito.
- A Fase 4G.2B.1 pode consumir IRRF por pool sem adivinhação.
- Nenhuma mudança na categoria ampla nem no comportamento de FII.
