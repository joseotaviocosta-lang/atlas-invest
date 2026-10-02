# ADR 047: Annual Investment Income Architecture (Dividends, JCP & FII Distributions)

**Status:** Accepted  
**Date:** 2026-10-01  
**Deciders:** Project Atlas Architecture Council  
**Context:** Phase 4H.4 / 4H.4A — Annual Investment Income Summary

---

## 1. Context and Problem Statement

Brazilian individual investors receive investment distributions categorized as Dividends, JCP (Juros sobre Capital Próprio), and FII earnings. These events possess distinct statutory withholding rates, exemption conditions, and reporting boxes on the Annual Federal Tax Return (DIRPF).

How should Project Atlas represent, classify, and aggregate these investment income events across calendar years (2025 vs 2026+) in a pure, deterministic, audit-proof, and scale-resilient architecture?

---

## 2. Decision Drivers

1. **Source of Truth:** The transaction ledger (`Transaction`) remains the single immutable source of truth.
2. **Deterministic Replay:** The annual income summary is a pure projection without database persistence of derived totals.
3. **Temporal Awareness:** Withholding rules and exemption thresholds change between 2025 and 2026 (JCP 15% -> 17.5%; Dividends 0% -> 10% on TOTAL monthly amount when > R$ 50k/month per payer, per Lei 15.270/2025). Transitional exemption applies for pre-2026 profits with valid corporate approval evidence.
4. **Payer-Level Integrity:** Aggregations must track paying sources by immutable `AssetId` and official issuer metadata (CNPJ/ticker).
5. **Zero Floating Point Arithmetic:** All monetary operations are exact arbitrary-precision calculations via `Money` / `Decimal.js`.
6. **No Scope Creep:** Do not calculate final annual IRPF liability or high-income global minimum tax in this phase.

---

## 3. Considered Options

- **Option A:** Persist annual income totals in a relational table updated on each transaction write.
- **Option B:** Recompute monthly taxes and capital gains alongside income in a single monolithic engine.
- **Option C:** Pure deterministic replay engine (`annual-investment-income-engine.ts`) consuming raw income transactions and producing immutable annual summaries grouped by category, payer, and month.

---

## 4. Decision Outcome

**Chosen Option:** **Option C**.

The engine receives `IncomeEventInputData[]` filtered for the target calendar year, executes statutory classification and aggregation, and returns an deeply frozen `AnnualInvestmentIncomeSummary` with a cryptographic SHA-256 fingerprint.

---

## 5. Consequences

- **Positive:**
  - 100% reproducible and testable via deterministic fixtures and fuzzing.
  - No database migration required for annual income aggregations.
  - Direct integration with Web and Mobile UI via dedicated view models.
- **Negative / Trade-offs:**
  - Requires bulk-loading income transactions for the calendar year; bounded by `tests/fiscal-api/annual-investment-income-query-budget.test.ts` (<= 10 queries, zero N+1).
