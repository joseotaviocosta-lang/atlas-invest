# ADR-274: Principal Original vs Valor Atualizado

## Status

Aceito (Fase 4D.2)

## Contexto

O valor devido cresce com multa e juros, mas a obrigação original não muda.

## Decisão

1. `TaxObligation.principalAmount` é imutável.
2. `TaxPaymentAdjustment.updatedAmount` é derivado para uma `paymentDate`
   explícita.
3. A data de pagamento é sempre um parâmetro explícito (`YYYY-MM-DD`); nenhum
   `Date.now()` oculto no domínio.
4. Pagamento integral de obrigação vencida deve corresponder ao valor
   atualizado verificado; pagar só o principal não quita (ADR-276).

## Consequências

- Histórico e principal preservados; atualização sempre explícita.
