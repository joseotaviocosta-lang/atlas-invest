# ADR-279: Carry-Forward como Estado de Pagamento

## Status

Aceito (Fase 4E)

## Contexto

Um valor abaixo do mínimo não é pagável por DARF. Marcá-lo como pago seria falso;
descartá-lo ou reduzi-lo a zero seria perda de histórico. É preciso representar
explicitamente o adiamento e a posterior agregação, sem tocar na responsabilidade
tributária.

## Decisão

1. **Camada Derivada Separada:** a lógica de mínimo DARF afeta apenas
   elegibilidade de pagamento e agregação. **Nunca** altera
   `MonthlyTaxLiability`, `TaxObligation.principalAmount` ou
   `TaxPaymentAdjustment.updatedAmount`.

2. **Abaixo do Mínimo Nunca é Descartado:** o valor gera um fato imutável
   `TaxCarryForwardEntry` com status `OPEN`; nunca é marcado `PAID`, nunca é
   reescrito para zero.

3. **Agregação como Unidade de Pagamento:** `TaxPaymentAggregation` combina o
   valor corrente com os acumulados de mesmo código; torna-se pagável quando o
   total atinge o mínimo.

4. **Status de Elegibilidade:** `PAYABLE`, `CARRIED_FORWARD`, `BELOW_MINIMUM`,
   `BLOCKED`, `NOT_REQUIRED` — apenas os justificados.

5. **Vencimento do Último Período:** o montante acumulado vence no prazo do
   último período de apuração (autoridade textual).

## Consequências

- O o obligation original permanece `OPEN` (não `PAID`) enquanto adiado.
- O histórico do adiamento é auditável e reproduzível.
- A responsabilidade tributária permanece intacta.
