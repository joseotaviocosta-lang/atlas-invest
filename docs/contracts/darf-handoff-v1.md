# Contrato: DarfHandoff v1 (Fase 4F)

Modo explícito de entrega interativa oficial. O Atlas prepara valores exatos e
orienta o usuário a emitir no serviço oficial (Sicalc). Não há geração local
(ADR-285).

## Estrutura (readiness/handoff)

```
{
  obligationId, competence,
  status: "USER_ACTION_REQUIRED" | "BLOCKED",
  reasonCode, generationMode: "OFFICIAL_INTERACTIVE_HANDOFF",
  eligible, overdue, revenueCode, dueDate,
  preparedValues: {
    revenueCode, competence, dueDate,
    principalAmount, carryForwardAmount?, lateFeeAmount?, interestAmount?, totalAmount
  } | null,
  destination: { sourceSystem: "RFB_SICALC", url, prefillSupported: false } | null,
  requiresTaxpayerIdentity, requiresUserAction,
  instructions: string[],
  identity: { identityAvailable, identityType?, maskedIdentifier? },
  adjustment, sourceSystem, officialGenerationSupported: false,
  disclaimer
}
```

## Regras

1. **Fonte oficial**: `destination.sourceSystem = "RFB_SICALC"`,
   `url = https://sicalc.receita.fazenda.gov.br/sicalc/principal`.
2. **Sem prefill fabricado**: `prefillSupported = false`; nenhum parâmetro de URL
   inventado.
3. **Entrada autoritativa**: consome `DarfPreparationV2`/elegibilidade (4E) e o
   ajuste 4D; **não** recalcula tributo.
4. **Fail closed**: abaixo do mínimo, código não suportado, sem vencimento ou
   ajuste indisponível ⇒ `BLOCKED` com `reasonCode`; nenhum valor é estimado.
5. **Rótulo de ação**: "Abrir Sicalc" / "Usar dados no Sicalc" — nunca
   "Gerar DARF oficial".
6. `principalAmount` é o principal agregado (corrente + carry-forward); o
   breakdown de carry-forward é preservado.
