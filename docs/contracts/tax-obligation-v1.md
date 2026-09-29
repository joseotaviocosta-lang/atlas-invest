# Contrato: TaxObligation v1 (Fase 4C.2)

Estado operacional **derivado** de uma `MonthlyTaxLiability` canônica
(autoridade de cálculo) e de uma `FederalTaxDeadlineEntry` `VERIFIED`
(autoridade de vencimento). **Nunca** recalcula imposto (ADR-264).

## Estrutura

```
{
  id, taxSubjectId, competence, taxBucket?, revenueCode?,
  liabilityFingerprint, revision,
  deadlineEntryId?, principalAmount? (string decimal | null), currency?,
  dueDate? (YYYY-MM-DD | null), status, reasonCode?,
  darfReadiness, darfReadinessReason?, dataQuality,
  supersededById?, provenance, createdAt, updatedAt
}
```

## Identidade

`(taxSubjectId, competence, liabilityFingerprint, revision)`. Mesma
responsabilidade → mesmo fingerprint → obrigação idempotente; responsabilidade
alterada → novo fingerprint → nova revisão e supersessão da anterior (ADR-267).

## Status

`BLOCKED | PROVISIONAL | OPEN | DUE | OVERDUE | PAID | SUPERSEDED |
RECONCILIATION_REQUIRED | NO_PAYMENT_DUE`.

- Persistido: `BLOCKED | PROVISIONAL | OPEN | PAID | SUPERSEDED |
RECONCILIATION_REQUIRED | NO_PAYMENT_DUE`.
- Derivado no servidor pelo relógio injetado: `OPEN` → `DUE`/`OVERDUE`
  (apenas status; sem multa/juros — ADR-269).

## Regras

1. Só `MonthlyTaxLiability.status = COMPLETE` positiva pode virar pagável.
2. `PARTIAL`/`BLOCKED` → `BLOCKED`, `principalAmount = null`.
3. `COMPLETE` zero → `NO_PAYMENT_DUE`, `NOT_REQUIRED` (sem R$ 0 falso).
4. Atividade suportada + não suportada na mesma competência → nunca total
   consolidado enganoso (falha fechada).
5. Sem entrada oficial de vencimento → `BLOCKED` / `MISSING_OFFICIAL_DEADLINE`.
6. Valores como strings decimais exatas; datas civis.
