# Contrato: TaxInterestRateSnapshot v1 (Fase 4D.2)

Snapshot imutável e versionado da taxa SELIC mensal oficial (ADR-272).

## Estrutura

```
{
  id, indexName: "SELIC", referenceMonth (YYYY-MM),
  ratePercent, sourceAuthority, sourceReference,
  sourceRetrievedAt, verifiedAt, version
}
```

## Identidade

`(indexName, referenceMonth, version)`; apenas a maior versão é usada.

## Regras

1. Fonte exclusivamente oficial (RFB/Sicalc). Tabelas secundárias são proibidas
   em produção.
2. Taxa ausente → `MISSING_OFFICIAL_INTEREST_RATE` (falha fechada).
3. Sem vazamento de taxas futuras: somente meses estritamente entre o vencimento
   e o pagamento.
4. Acumulação é **soma simples** de percentuais, nunca capitalização.
