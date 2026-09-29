# Contrato: DarfPreparationV2 v1 (Fase 4E)

Extensão aditiva do DarfPreparation v1 (que permanece congelado) com o valor
acumulado de períodos anteriores e a elegibilidade de mínimo (ADR-283). **Não**
é documento oficial.

## Estrutura

```
{
  revenueCode, targetCompetence,
  currentPrincipal:  { amount (string decimal), currency } | null,
  carryForwardAmount:{ amount, currency } | null,
  totalPayable:      { amount, currency } | null,
  minimumThreshold:  { amount, currency },
  dueDate: string | null,
  eligibilityStatus: "PAYABLE" | "CARRIED_FORWARD" | ...,
  lateFee: null,               // não calculado na 4E (exige data de pagamento)
  interest: null,
  officialUpdatedAmount: null
}
```

## Regras

1. Aditivo: v1 não é alterado/removido.
2. Exposto apenas quando a elegibilidade é `PAYABLE` ou `CARRIED_FORWARD`.
3. `lateFee`/`interest`/`officialUpdatedAmount` permanecem `null` nesta fase;
   acréscimos legais exigem data de pagamento explícita e autoridade oficial
   (fase 4D), e o pagamento tardio de montante agregado falha fechado.
4. `dueDate` é o vencimento do **último** período de apuração.

## Proibições

- Sem código de barras, QR Code, PIX, linha digitável ou número de documento.
- Sem geração de arquivo/documento oficial e sem auto-pagamento.
- Sem cálculo financeiro no cliente; valores vêm do servidor.
