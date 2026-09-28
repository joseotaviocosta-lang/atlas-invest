# ADR-257: Semântica Histórica (as-of) de Inputs Tributários

## Status

Aceito (Fase 4B.3)

## Contexto

Metadados de condição (ex.: FII) variam no tempo. Usar o valor atual para um
período passado produziria resultado incorreto.

## Decisão

1. Fatos de FII são datados (`asOfDate`).
2. A leitura por `asOf` retorna o fato mais recente com `asOfDate <= asOf` por `(assetId, sourceType, sourceReference)`.
3. **Sem vazamento futuro:** fatos posteriores a `asOf` nunca são usados.
4. Retenção é segregada por competência (`competence`); competência de setembro não aparece em agosto.
5. Valores correntes não sobrescrevem fatos históricos.

## Consequências

- Cálculo histórico determinístico e sem retroalimentação futura.
- Auditoria temporal preservada.
