# ADR-266: Separação da Evidência de Pagamento

## Status

Aceito (Fase 4C.2)

## Contexto

Pagamento é fato operacional; a responsabilidade tributária é verdade derivada
imutável. Confundir os dois corromperia a apuração.

## Decisão

1. `TaxPaymentEvidence` é manual (`MANUAL_CONFIRMED`), sem sincronização
   bancária.
2. Pagamento **nunca** altera a `MonthlyTaxLiability` nem o
   `liabilityFingerprint`.
3. Apenas pagamento integral é aceito (`amount == principalAmount`); sem
   parcial, sobrepagamento, reembolso ou crédito.
4. Idempotente por origem; conflito de valor na mesma origem → `409`.
5. Cross-user → `404`.
6. Registro confirmado marca a obrigação como `PAID`.

## Consequências

- Ledger tributário permanece imutável e reconciliável.
- Nenhum pagamento automático.
