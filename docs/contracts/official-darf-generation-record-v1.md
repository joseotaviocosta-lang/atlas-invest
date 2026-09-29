# Contrato: OfficialDarfGenerationRecord v1 (Fase 4F)

Registro imutável de preparação/entrega oficial do DARF. **Não** é o documento
oficial; o Atlas não gera o DARF (ADR-285, ADR-288).

## Estrutura

```
{
  id, taxSubjectId, taxObligationId?, taxPaymentAggregationId?,
  generationMode: "OFFICIAL_INTERACTIVE_HANDOFF",
  revenueCode, competence,
  dueDate: string | null,
  principalAmount, lateFeeAmount?, interestAmount?, totalAmount, currency,
  officialDocumentId: null, officialReference: null,
  sourceSystem: "RFB_SICALC",
  status, version, fingerprint, supersededById?, createdAt
}
```

## Regras

1. **Imutável**: nunca sobrescrito; nova preparação gera novo registro e marca o
   anterior `SUPERSEDED`.
2. **Idempotente** por `(taxSubjectId, taxObligationId, fingerprint)`.
3. `generatedByAtlas` é sempre `false`; `officialDocumentId`/`officialReference`
   permanecem `null` nesta fase.
4. **GENERATED ≠ PAID**: o registro não altera a obrigação nem a evidência de
   pagamento.
5. Valores como strings decimais exatas; datas civis `YYYY-MM-DD`.
6. Nenhum PDF, código de barras, PIX ou QR é armazenado/gerado.
