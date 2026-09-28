# ADR-246: Trilha de Cálculo Tributário

## Status

Aceito (Fase 4B)

## Contexto

Um resultado fiscal precisa ser auditável: de onde veio cada valor e sob qual
regra.

## Decisão

1. Toda apuração produz `TaxCalculationTraceV1` estruturada (nunca prosa).
2. Estágios: `INPUT, RULE_RESOLUTION, CLASSIFICATION, EXEMPTION, OPENING_LOSS,
LOSS_APPLICATION, TAXABLE_BASE, RATE, WITHHOLDING, FINAL`.
3. Cada entrada carrega `operation`, `status`, `exactInputs`/`exactOutput`
   (strings decimais), `ruleVersion` e `inputReferences` (eventos fiscais).
4. Determinismo: mesmos insumos → trilha logicamente idêntica (referências
   ordenadas).
5. Sem valores em ponto flutuante; sem PII/segredos.

## Consequências

- Auditoria completa de cada componente de imposto.
- UI pode oferecer "Como foi calculado" a partir da trilha do servidor.
