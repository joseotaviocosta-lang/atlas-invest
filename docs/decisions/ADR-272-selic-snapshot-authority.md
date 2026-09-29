# ADR-272: Autoridade do Snapshot SELIC

## Status

Aceito (Fase 4D.2)

## Contexto

Os juros usam a taxa SELIC mensal oficial, somada simplesmente.

## Decisão

1. `TaxInterestRateSnapshot` é imutável e versionado
   (`indexName`, `referenceMonth`, `version`).
2. Fonte exclusivamente oficial (RFB/Sicalc); tabelas secundárias proibidas.
3. Apenas meses estritamente entre vencimento e pagamento; +1% no mês do
   pagamento; sem vazamento de taxas futuras.
4. Taxa ausente → `MISSING_OFFICIAL_INTEREST_RATE` (falha fechada).

## Consequências

- Cálculo de juros determinístico e auditável.
- Nenhuma capitalização (soma simples).
