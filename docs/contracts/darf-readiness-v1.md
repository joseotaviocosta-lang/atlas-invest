# Contrato: DarfReadiness v1 (Fase 4C.2)

Indica se os **dados** para pagamento estão prontos. **Não** é geração de DARF
oficial (ADR-265).

## Estados

`READY | PARTIAL | BLOCKED | NOT_REQUIRED`

- `READY`: `MonthlyTaxLiability` COMPLETE positiva + `revenueCode` verificado +
  `dueDate` oficial `VERIFIED`.
- `PARTIAL`: competência ainda em apuração (`PROVISIONAL`).
- `BLOCKED`: apuração incompleta, bucket não suportado, ou ausência/ambiguidade
  de vencimento oficial.
- `NOT_REQUIRED`: `NO_PAYMENT_DUE` (não há imposto a recolher).

## Regras

1. A UI pode dizer "Dados para pagamento prontos"; **nunca** "DARF oficial
   gerado" (ADR-265).
2. Nenhum código de barras, QR, PIX ou número de documento oficial é produzido.
3. O cliente nunca calcula readiness nem vencimento.
