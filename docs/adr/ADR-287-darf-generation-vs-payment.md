# ADR-287: Geração vs. Pagamento

## Status

Aceito (Fase 4F)

## Contexto

Gerar um DARF não é pagá-lo. Confundir os estados levaria a marcar obrigações
como quitadas sem evidência de pagamento.

## Decisão

1. **GENERATED ≠ PAID**: o registro de geração/handoff não altera a obrigação.
2. **Evidência de pagamento separada**: `TaxPaymentEvidence` permanece a única
   prova de pagamento (manual, confirmada).
3. **Entrada autoritativa**: a camada de geração consome `DarfPreparationV2`/
   elegibilidade (4E) e o ajuste 4D; **não** recalcula tributo.
4. **Estados distintos na UX**: dados preparados, ação necessária, gerado e pago
   são estágios separados.
5. **Supersessão**: mudança de preparação (fingerprint) marca o registro
   anterior `SUPERSEDED`.

## Consequências

- Nenhuma obrigação é quitada por geração de documento.
- A trilha de auditoria distingue preparação, emissão e pagamento.
