# Post-B3-Baseline Roadmap — Resume Product Development

Status: audit + decision only. No feature code. Ledger 137, replay
109/109 SUCCESS, 38/40 frozen, migrations 46 — all re-verified this phase.

## 1. Capability map (evidence-backed)

COMPLETE: portfolio UI (state/positions/history), Import Hub, replay
engine, history/activity, performance/TWR suite, tax dashboard + engine,
AI endpoints, history/audit surfaces.
FUNCTIONAL_BUT_PARTIAL: B3/CSV flows, manual operations, corporate
actions, cost-basis UX (honest `—`, no math), reconciliation panel,
assets catalog, income views, notifications (read-only), review/inbox,
LGPD, reliability (no Sentry/OTel), mobile parity.
FOUNDATION_ONLY: market intelligence (placeholder), live B3 sync
(simulated).
BLOCKED (by evidence, not code): EGIE3/ITSA4/SNELL closes.

## 2. Real-data lessons

- 36/41 positions INCOMPLETE: cost evidence exists but has no product
  path (KCRE11 26/12 leg @ 8.50; ITSA4 subscription @ 6.70 — both
  documented, both unusable today). Cost gaps are THE tax blocker.
- Negotiation exports are provably incomplete; movement starts 28/10/2025.
  Any future importer must stay fail-closed with evidence grading.
- Trade-date vs settled-custody basis divergence is real (KCRE11) and must
  stay labeled, never "fixed" by date falsification.
- Audit scripts must NOT become product: the reviews panel already covers
  reconciliation visibility (Part I verdict: no dashboard).

## 3. Contextual tax intelligence (branch namesake)

Nothing exists: no engine, route, surface, ADR, or TODO — only the branch
name. Portfolio-scoped tax signals are deliberately absent AND
test-forbidden (`never emits tax signals`). Any future here needs an ADR
first and must not weaken fail-closed tax semantics. Exploratory only.

## 4. Candidate scoring (1–5; Effort S/M/L separate)

| Candidate                                | Value | Usefulness | RiskRed. | Leverage | Evidence | Effort              |
| ---------------------------------------- | ----- | ---------- | -------- | -------- | -------- | ------------------- |
| D. Cost-basis evidence workflow          | 5     | 5          | 5        | 5        | 4        | M                   |
| F. Fiscal reminder delivery              | 4     | 3          | 4        | 3        | 4        | M                   |
| B. Contextual tax intelligence (explor.) | 4     | 3          | 2        | 3        | 1        | L+ADR               |
| H. Polish bundle (CA toast et al.)       | 2     | 2          | 2        | 1        | 5        | S                   |
| C. Reconciliation dashboard              | 2     | 2          | 2        | 1        | 5        | M (rejected per §2) |

## 5. Recommended next phase

**D. Cost-basis evidence workflow** — goal: give owners an actionable,
fail-closed path to attach historical acquisition evidence (brokerage
notes, subscription statements, opening-position cost) to INCOMPLETE
positions without ever fabricating or editing ledger quantities.
Why now: the single biggest unlock for real tax output (DARF blocked on
INCOMPLETE); two concrete demand cases already documented; feeds the
existing tax engine directly.
User-visible result: per-position "improve cost" flow with evidence
grading (proven > declared > missing), cost status transitions, and
honest partial progress.
Scope: evidence intake + grading + cost enrichment reads (new derived
state, never ledger mutation); strict no-fabrication invariants.
Non-goals: editing transactions, auto-inference, changing replay math,
touching blocked tickers' quantities.
Risks: evidence fraud surface (mitigate: provenance + review states);
scope creep into ledger editing (forbid explicitly).
Size: M. Human validation: required (owner supplies real brokerage note).

Second: **F. Fiscal reminder delivery** (existing reminder engine →
push/email; deadline-miss risk reduction). Third: **B exploratory**
(precondition: ADR + invariant review).

## 6. Cleanup gate: NO_CLEANUP_GATE

All debt is test-only (migration-count pins, version pins, throttle
env-fragility) or cosmetic (wording unconfirmed, CA toast touches UI
only). None blocks D. Leave documented; do not refactor.

## 7. Baseline invariants (every future phase must preserve)

Ledger 137 · replay 109/109 SUCCESS · 38/40 frozen · EGIE3/ITSA4/SNELL
evidence-blocked and untouched · no fake cost · no fake tax · automated
tests never mutate the real portfolio (atlas_test only).

## 8. Release context

No engineering blocker for controlled beta beyond OWNER_DECISION; legal
foundation present (no DPO automation); data limitation declared (95%,
not complete). Deployment remains unauthorized (NO DEPLOY standing).
