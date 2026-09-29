# Contrato: TaxObligationStatus v1 (Fase 4C.2)

Semântica de status operacional de uma obrigação tributária.

## Estados

| Status                    | Significado                                                     | Persistido? |
| ------------------------- | --------------------------------------------------------------- | ----------- |
| `BLOCKED`                 | Apuração incompleta, bucket não suportado ou vencimento ausente | sim         |
| `PROVISIONAL`             | Competência ainda aberta (não final)                            | sim         |
| `OPEN`                    | Pagável, dentro do prazo                                        | sim         |
| `DUE`                     | Pagável, vence hoje (derivado do relógio)                       | não         |
| `OVERDUE`                 | Pagável, vencido (derivado do relógio)                          | não         |
| `PAID`                    | Pagamento manual confirmado                                     | sim         |
| `SUPERSEDED`              | Substituído por nova revisão                                    | sim         |
| `RECONCILIATION_REQUIRED` | Pago e depois alterado — conciliação manual                     | sim         |
| `NO_PAYMENT_DUE`          | Sem imposto a recolher                                          | sim         |

## Regras

1. `DUE`/`OVERDUE` são **apenas status**: nenhum valor de multa/juros é
   calculado (ADR-269).
2. O relógio é injetado (date-only `YYYY-MM-DD`), determinístico em testes.
3. O cliente apenas formata; nunca deriva status.
