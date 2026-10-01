# Annual IRPF Implementation Roadmap — 2026

> Phase 4H.1. Proposed subsequent phases and boundaries. Derived from
> `annual-irpf-legal-foundation-2026.md` and
> `annual-irpf-data-sufficiency-2026.md`. Nothing here is implemented yet.

Guiding principles:

1. Annual IRPF is a **derived layer** over the immutable ledger + monthly fiscal
   state — never a second transaction/tax engine (ADR-301).
2. Calendar year ≠ declaration exercise ≠ rule effective date.
3. Unknown annual data ≠ zero; blocked data must fail closed.
4. No Receita automation, no submission, no Tax AI.

---

## 1. Proposed phases

### 4H.2 — Annual Period & Position Foundation

- Typed `CalendarYear`, `DeclarationExercise`, `AnnualTaxPeriod`.
- Pure year-end position/cost read model derived from replay `asOf 12-31`
  (no persistence).
- Opening-history confirmation model (REQUIRES_USER_CONFIRMATION).
- Fail-closed for INCOMPLETE cost / unknown classification.

**Exit:** deterministic year-end position per asset + completeness status.
No tax computation.

### 4H.3 — Annual Capital-Market Fiscal Summary

- Bridge monthly 4G (normal/day/FII) into an annual summary by category.
- Annual loss carry display (normal/day/FII), without recomputation.
- Annual IRRF display (normal → annual adjustment; day trade → restitution).
- 6015 obligation/payment aggregation for the calendar year.

**Exit:** annual capital-market summary referencing monthly facts.

### 4H.4 — Income: Dividends / JCP / FII Income

- Income event ingestion/confirmation (external input provider seam).
- Dividend regime (isenção through 2025; 10% retention > R$50k from 2026).
- JCP separately modelled (17,5% from 2026).
- FII income conditional exemption with fund-condition facts.

**Exit:** annual income summary with provenance and completeness.

### 4H.5 — Annual Completeness & Confirmation

- Explicit completeness states (`COMPLETE` / `PARTIAL` / `BLOCKED` /
  `REQUIRES_CONFIRMATION`).
- Confirmation mechanism (DERIVED/CONFIRMED/MISSING/CONFLICTING/NOT_APPLICABLE).
- Provenance model across ledger/fiscal/manual/official rule.

**Exit:** every annual fact is complete or explicitly blocked/confirmable.

### 4H.6 — Annual Report / Declaration Support

- Human-readable annual report and structured summary (no Receita submission).
- Data checklist / declaration-support package.
- Explicit form-area mapping only where legally CONFIRMED.

**Exit:** user-consumable annual package; no official document generation.

### 4H.7 — Final E2E / Hardening

- Year-versioned rule resolution; historical replay determinism.
- Scale/query-budget; security (CPF/masking/cross-user); retention policy.
- Full regression + governance closure.

**Exit:** production-ready annual reporting layer (still no submission).

---

## 2. Future seam (not implemented)

```
Annual IRPF Engine
  → trusted structured annual facts
  → future AI explanation layer   (Tax AI remains UNSUPPORTED_TAX)
```

No annual context is connected to AI in 4H.1 or planned automatically.

---

## 3. Rule-versioning strategy (design)

Annual rule resolution is **year-aware**:

```
ruleId
ruleVersion
effectiveFrom
effectiveTo?          // optional
calendarYear          // applicability
declarationExercise   // applicability
legalSource
```

There is no global "current tax rule". Historical annual replay resolves rules
applicable to the relevant year (Phase 4H §33/§34). Unsupported/partial rules
fail closed.

---

## 4. Explicitly excluded (unless separately approved)

- Annual declaration submission / Receita automation / captcha / certificates.
- Tax AI enablement.
- ETF/BDR/options/futures/crypto taxation.
- Foreign-asset regimes (Lei nº 14.754/2023) beyond stored data.
- Minimum-tax computation requiring non-Atlas income (only displayable with
  user-confirmed inputs).

---

## 5. Owners (proposed, repository conventions)

| Concern                      | Owner                                                       |
| ---------------------------- | ----------------------------------------------------------- |
| Annual period, rules, trace  | `packages/tax-engine` (`annual-irpf/`)                      |
| Position/cost read           | `packages/portfolio-engine` (replay `asOf`)                 |
| Application use cases        | `apps/api/src/application/fiscal`                           |
| Read models / API            | `apps/api` + `monthly-tax-*` read-model conventions         |
| UI (web/mobile)              | `apps/web`, `apps/mobile`, `packages/ui` view-models        |
| Persistence (if ever needed) | `packages/database` (additive, recalculable, fingerprinted) |

Future annual calculation must stay independent from NestJS, Prisma, React and
React Native (Phase 4H §36).
