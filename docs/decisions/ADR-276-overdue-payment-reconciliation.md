# ADR-276: Reconciliação de Pagamento em Atraso

## Status

Aceito (Fase 4D.2)

## Contexto

Em obrigação vencida, o valor devido supera o principal.

## Decisão

1. Para obrigação vencida, o pagamento manual só é aceito se o valor for igual
   ao `updatedAmount` verificado.
2. Pagar apenas o principal (ou valor insuficiente) é **rejeitado**
   (`400`), não marcado como `PAID`.
3. Se a atualização não puder ser verificada → `TAX_PAYMENT.ADJUSTMENT_UNAVAILABLE`.
4. Não há crédito/estorno automático; sobrepagamento é rejeitado.
5. A evidência de pagamento existente permanece inalterada.

## Consequências

- Nenhuma quitação silenciosa incorreta.
