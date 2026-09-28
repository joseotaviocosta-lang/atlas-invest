# Contrato: TaxInputReadiness v1 (Fase 4B.2)

Prontidão dos inputs canônicos para uma competência. Read-only; **nenhum** cálculo
de imposto (ADR-252).

## Estrutura

```
{
  competence,
  tradeClassificationStatus, withholdingStatus, fiiMetadataStatus,
  issues[], capabilities{...}, classificationCoverage{required,classified,unknown},
  provenanceReferences[]
}
```

## Status

`COMPLETE | PARTIAL | MISSING | UNKNOWN | NOT_REQUIRED`

## Issues

`UNKNOWN_TRADE_CLASSIFICATION`, `MISSING_WITHHOLDING_INPUT`, `UNVERIFIED_WITHHOLDING`,
`MISSING_FII_ELIGIBILITY_METADATA`, `STALE_FII_ELIGIBILITY_METADATA`.

## Regras

1. `NOT_REQUIRED` quando nenhuma regra/evento exige o input.
2. `COMPLETE` somente quando todos os inputs exigidos estão presentes e válidos
   (retenção `CONFIRMED`; FII `KNOWN` e não obsoleto).
3. `PARTIAL`/`MISSING`/`UNKNOWN` nunca são apresentados como completos.
4. Staleness de metadado FII é sinalizada explicitamente.
5. A prontidão **não** ativa responsabilidade tributária: a 4B.2 adiciona zero regras
   de produção. `productionTaxLiabilityEnabled = false`.

## API

`GET /api/v1/fiscal/inputs/:competence` — autenticado, escopo do sujeito passivo,
isolamento cross-user (404/sem vazamento).
