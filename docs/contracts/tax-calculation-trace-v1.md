# Contrato: TaxCalculationTrace v1 (Fase 4B)

Trilha estruturada (nunca prosa) que explica cada estágio do cálculo (ADR-246).

## Estágios

`INPUT, RULE_RESOLUTION, CLASSIFICATION, EXEMPTION, OPENING_LOSS,
LOSS_APPLICATION, TAXABLE_BASE, RATE, WITHHOLDING, FINAL`

## Entrada de trilha

```
{ stage, category?, operation, ruleVersion?, inputReferences?, exactInputs?, exactOutput?, status }
```

## Regras

1. **Estruturado:** sem texto livre; campos tipados.
2. **Decimal exato:** `exactInputs`/`exactOutput` são strings decimais; nunca
   `number`.
3. **Proveniência:** `inputReferences` citam `FiscalEventId`/`sourceTransactionId`;
   `ruleVersion` cita a versão da regra efetiva.
4. **Determinismo:** mesmos insumos → trilha logicamente idêntica; ordenação
   estável (`inputReferences` ordenados).
5. **Estabilidade histórica:** um mês calculado sob a regra V1 permanece
   reproduzível após a introdução de V2 (ADR-248).
6. **Privacidade:** a trilha não expõe documentos, PDF, CPF ou segredos.
