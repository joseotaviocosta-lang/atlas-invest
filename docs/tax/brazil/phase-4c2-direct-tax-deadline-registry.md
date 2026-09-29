# Phase 4C.2 — Direct Tax Deadline Registry, Obligations & DARF Readiness

Research date: **2026-09-28**
Activated bucket: **FII_SALE** · revenue code **6015**.

## Why a direct registry (not a generic calendar)

Phase 4C.1 could not certify, from inspected official text, the generic "dia
útil" semantics for federal tax _payment_ (Saturday, holidays, ponto
facultativo, local holidays, banking days). Reconstructing a business calendar
from unverified rules would be fail-open.

The RFB **Agenda Tributária** publishes the already-resolved payment date per
revenue code + competence, via the **Ato Declaratório Executivo CORAT**. This is
the strongest available authority for the obligation, so Atlas consumes it
directly (ADR-262, ADR-268).

## Official source chain

```
FII_SALE
  → renda variável (FII bolsa = same treatment as ações em bolsa; RFB official page)
  → revenue code 6015 ("Ganhos líquidos em operações em bolsa")
  → ADE CORAT (DOU)
  → resolved due date
```

| Competence | Due date   | Source                                | Evidence                                              |
| ---------- | ---------- | ------------------------------------- | ----------------------------------------------------- |
| 2026-08    | 2026-09-30 | ADE CORAT nº 63/2026 (DOU 27/08/2026) | `.../2026/Setembro/dia-30-09-2026` + annex `.xlsx`    |
| 2026-09    | 2026-10-30 | ADE CORAT nº 78/2026 (DOU 28/09/2026) | `.../2026/Outubro/dia-30-10-2026` (31/10 is Saturday) |
| 2025-07    | 2025-08-29 | Agenda Tributária ago/2025            | `.../2025/agosto/dia-29-08-2025` (30-31/08 weekend)   |

The 2025-07 and 2026-09 entries also demonstrate that the official agenda already
applies weekend adjustment (last business day), so no generic calendar is needed.

## Encoded model

- `FederalTaxDeadlineEntry`: immutable/versioned official fact
  (`revenueCode`, `competence`, `dueDate`, `status`, full provenance, `version`).
  At most one `VERIFIED` active per `(revenueCode, competence)` (partial unique
  index).
- `TaxObligation`: derived operational state
  (`liabilityFingerprint`, `revision`, `dueDate`, `principalAmount`, `status`,
  `darfReadiness`, provenance). Never recalculates tax (ADR-264).
- `TaxPaymentEvidence`: manual-only operational record (ADR-266).

## Fail-closed behaviour

- No official deadline entry → `BLOCKED` / `MISSING_OFFICIAL_DEADLINE`.
- Ambiguous (duplicate `VERIFIED`) → `BLOCKED` / `AMBIGUOUS_OFFICIAL_DEADLINE`.
- `PARTIAL`/`BLOCKED` liability → `BLOCKED`.
- Unsupported bucket / mixed supported+unsupported activity → `BLOCKED`.
- Zero `COMPLETE` liability → `NO_PAYMENT_DUE` / `NOT_REQUIRED`.

## Versioning & corrections

- Corrections create a new version; the previous is `SUPERSEDED` (ADR-263).
- A liability change supersedes the previous obligation; a paid obligation whose
  liability changed becomes `RECONCILIATION_REQUIRED` (ADR-267).
- Payment evidence is preserved; no automatic credit/refund.

## Known limitations

- Only `FII_SALE` (revenue code 6015) is production-supported. Other buckets
  fail closed.
- Only three official deadline entries are seeded (2025-07, 2026-08, 2026-09).
  Other competences fail closed until sourced.
- 2027+ calendar is not yet published by the RFB (rolling monthly publication).
- No Sicalc runtime integration, no DARF generation, no penalty/interest, no
  auto-payment (ADR-265, ADR-269).
- Multi-bucket obligations per competence are not yet modelled (single supported
  bucket).
