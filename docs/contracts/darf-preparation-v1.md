# Contrato: DarfPreparation v1 (Fase 4C.2)

Dados estruturados de preparação de pagamento, expostos apenas quando
`darfReadiness = READY`. **Não** é documento oficial (ADR-265).

## Estrutura

```
{
  revenueCode, competence, taxBucket,
  principalAmount: { amount (string decimal), currency },
  dueDate (YYYY-MM-DD),
  sourceProvenance: {
    entryId, dueDate, version,
    sourceAuthority, sourceDocument, sourceReference,
    sourcePublishedAt, verifiedAt
  }
}
```

## Proibições

- Sem código de barras, QR Code, PIX, linha digitável ou número de documento.
- Sem geração de arquivo/documento oficial.
- Sem cálculo no cliente; valores vêm do servidor.
