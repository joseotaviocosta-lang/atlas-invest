# Contrato: TaxInputPersistence v1 (Fase 4B.3)

Persistência canônica de inputs tributários (classificação de operação,
retenção/IRRF, metadados de FII). Auxiliar; nunca substitui o livro-razão.

## Tabelas

- `tax_trade_classification_records`
- `tax_withholding_input_records`
- `fii_tax_eligibility_fact_records`

## Semântica comum

- `taxSubjectId` (UUID) — escopo do sujeito passivo; sem PII.
- `sourceType` + `sourceReference` — proveniência explícita (≤ 255 chars).
- `fingerprint` (SHA-256) — idempotência determinística.
- `conflictStatus` (`NONE | CONFLICT`) — conflito explícito.
- `provenance` (JSONB) — metadados de proveniência.
- `createdAt`; `confirmedAt` quando manual/confirmado.

## Unicidade (identidade)

| Entidade             | Identidade única                                                 |
| -------------------- | ---------------------------------------------------------------- |
| trade classification | taxSubjectId + transactionId + sourceReference                   |
| withholding          | taxSubjectId + sourceType + sourceReference                      |
| FII fact             | taxSubjectId + assetId + sourceType + sourceReference + asOfDate |

## Regras

1. Nunca muta linhas imutáveis de `transactions`.
2. Valores monetários/percentuais: decimal exato `DECIMAL(38,18)`; serialização por string canônica.
3. `amount` nulo quando `status = UNKNOWN` (nunca fabricado).
4. `assetId` referencia `assets` (nunca ticker como identidade).
5. Migração aditiva; sem alterações destrutivas.
6. `FiiTaxEligibilityFactRecord` é factual; **não** contém isenção/alíquota/tributabilidade.
