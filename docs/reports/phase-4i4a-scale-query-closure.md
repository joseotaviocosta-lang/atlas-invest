# Phase 4I.4A — Scale & Query-Stability Benchmark Report

- **Phase:** 4I.4A (benchmark / validation only; no tax-semantic change)
- **Harness:** `scripts/high-income-application-scale.ts` (`pnpm test:high-income:scale [scenario]`)
- **Path measured:** full HTTP path — auth guard → 4H annual reads (income + 12-month
  capital-market) → persisted evidence (bulk) → 4I.1 snapshot → 4I.2 calculation → 4I.3
  redutor → status aggregation → serialization. Includes auth, DB queries, 4H loaders,
  evidence load, 4I engines and serialization (warmup excluded).
- **DB:** real PostgreSQL test DB (`atlas_test`). No mocked persistence.
- **Protocol:** 2 warmups + 5 measured runs per scale point (unless noted).

---

## 1. Payer scale matrix (deterministic mixed states)

Mix per payer index: complete-positive / missing / stale / zero-redutor / complete.

| Payers | min        | median     | mean         | p95        | max        | queries | memory    |
| ------ | ---------- | ---------- | ------------ | ---------- | ---------- | ------- | --------- |
| 1      | 177–332    | 202–504    | 202.6–490.6  | 244–602    | 244–602    | 93×5    | ~2–24MB   |
| 10     | 166–365    | 178–399    | 200.4–412.2  | 296–457    | 296–457    | 93×5    | ~5–11MB   |
| 100    | 264–374    | 302–410    | 317.8–447    | 371–583    | 371–583    | 93×5    | ~17–50MB  |
| 1,000  | 1050–1538  | 1210–2375  | 1298.8–2223  | 1817–3201  | 1817–3201  | 93–94   | ~60–150MB |
| 10,000 | 9031–13838 | 9084–15809 | 9311.8–15545 | 9913–16732 | 9913–16732 | 93–96   | ~96–297MB |

Ranges span two runs under different machine load (heavy concurrent processes on the shared
host); the SHAPE is stable across runs: constant 93 queries through 1k payers, 93–96 at 10k
(pool-validation `SELECT 1`s only). Absolute latencies scale roughly linearly with payer count
in the in-memory domain aggregation (4H.4 events/payers + redutor breakdown + serialization),
not with query count. Stale-subset exact at every point (0/0, 2/2, 20/20, 200/200, 2000/2000);
re-read fingerprint stability confirmed at every point.

Statuses: 1/10 payers NOT_APPLICABLE (totals below R$600k); 100+ INCOMPLETE_REDUCTION_DATA
(deterministic mixed evidence states by design: complete/missing/stale/zero/complete).
Payer identity union verified exact at every point (100→100, 1k→1k, 10k→10k).

## 2. Evidence revision scale (single payer, repo-level writes)

| Revisions | append latency (at target) | current lookup | chain integrity |
| --------- | -------------------------- | -------------- | --------------- |
| 100       | 7ms                        | 3ms            | OK              |
| 1,000     | 10ms                       | 5ms            | OK              |
| 10,000    | 5ms                        | 2ms            | OK              |

Revision history integrity (10k): all preserved / current correct / supersedes chain valid /
no duplicate active authority / fingerprint correct: PASS (verified programmatically per point).
Write latency is flat across revision depth (indexed identity lookup + single insert).

## 3. Annual fact scale (dividend facts through the real path)

| Facts  | min   | median | mean    | p95   | max   | queries | memory   |
| ------ | ----- | ------ | ------- | ----- | ----- | ------- | -------- |
| 1,000  | 963   | 1011   | 1041.6  | 1218  | 1218  | 93×5    | 91.61MB  |
| 10,000 | 8072  | 8342   | 8329    | 8614  | 8614  | 94×5    | GC noise |
| 50,000 | 45369 | 46428  | 46832.8 | 49405 | 49405 | 109–110 | 49.37MB  |

No per-fact DB query (bulk `createMany` setup; bounded reads). Fact latency is dominated by
in-memory domain work over the fact set (roughly linear: 1k→1s, 10k→8.3s, 50k→46s), not by
query count. The 50k query delta (+13 assets, +3 pool-validation) is driver-level bulk-`in`
chunking past ~32k params (proven: 50k ids → exactly 2 queries per bulk load) plus `SELECT 1`
pool-validation queries — see §5 analysis.

No per-fact DB query (bulk `createMany` setup; bounded reads).

## 4. Combined stress (1000 payers + 10k evidence revisions + facts)

| Dataset                            | median | p95  | max  | queries | memory | correctness                                          |
| ---------------------------------- | ------ | ---- | ---- | ------- | ------ | ---------------------------------------------------- |
| 1k payers / 10k revisions / 1k txs | 1347   | 1496 | 1496 | 93×5    | TBD    | true (INCOMPLETE_REDUCTION_DATA, fingerprints valid) |

Categories at combined: auth 2, evidence 3, portfolios 13, obligations 1, ledger 13, assets 13,
accounts 12, monthly-fiscal 36 — the canonical 93 shape, unchanged under combined load.

## 5. Query stability (per scale point)

| Scale      | total   | auth | evidence | portfolios | obligations | ledger | assets | accounts | monthly-fiscal | other |
| ---------- | ------- | ---- | -------- | ---------- | ----------- | ------ | ------ | -------- | -------------- | ----- |
| 1 payer    | 93      | 2    | 3        | 13         | 1           | 13     | 13     | 12       | 36             | 0     |
| 5 payers   | 93      | 2    | 3        | 13         | 1           | 13     | 13     | 12       | 36             | 0     |
| 1k facts   | 93      | 2    | 3        | 13         | 1           | 13     | 13     | 12       | 36             | 0     |
| 10k facts  | 94      | 2    | 3        | 13         | 1           | 13     | 13     | 12       | 36             | 1     |
| 50k facts  | 109–110 | 2    | 3        | 13         | 1           | 13     | 26     | 12       | 36             | 3     |
| 10k payers | 93–95   | 2    | 3        | 13         | 1           | 13     | 13\*   | 12       | 36             | 0–3   |
| combined   | 93      | 2    | 3        | 13         | 1           | 13     | 13     | 12       | 36             | 0     |

\* Per-point category splits at 10k payers were not captured (totals 93–95 measured). The 50k-facts
split is fully measured. The asset-doubling mechanism (bulk-`in` chunking past ~32k params, proven
in isolation) applies identically to any bulk load past the threshold; per-point totals show no
per-payer growth (93 at 1/10/100 payers and 1k facts; 93–95 at 1k/10k payers).

- per-payer: NO · per-evidence: NO · per-income: NO · per-section: NO · per-revision: NO
- N+1: NO. Query shapes are byte-identical across payer counts (proven by test
  `annual-high-income-query-budget.test.ts`), and bulk-load chunking past ~32k bind params
  (driver-level, proven in isolation: one 50k-id `findByIds` → exactly 2 identical-shape
  queries) plus `SELECT 1` pool-validation queries (no application code issues raw SQL;
  verified by grep) explain the 93→94→110 stepwise deltas. Both effects are
  driver/infrastructure-level, deterministic in shape, bounded (⌈N/32767⌉ per bulk call site
  across 13 constant call sites), and involve zero per-payer, per-evidence, per-income or
  per-revision application queries.

## 6. 93-query audit

- **architecturally justified:** YES.
- **avoidable duplicate loads:** NO (within the frozen 4H architecture).
- **classification:** EXPECTED.
- **details:** the 12-month capital-market loop (`GetAnnualCapitalMarketSummaryUseCase` →
  `GetMonthlyTaxLiabilityUseCase` × 12, pre-existing Phase 4G/4H.3 design) accounts for
  ~12×(ledger + portfolios + accounts + assets + monthly-fiscal) ≈ 84 of 93 queries. All are
  bounded by 12 calendar months × user portfolios — never by payer, evidence, income-item or
  revision counts. Per §36 of the phase brief, no refactor is performed merely to reduce the
  number: the shape is constant and scale-acceptable.

## 7. Concurrency scale (100 payers, two users)

| Concurrent | elapsedMs | allOk | userA_fps | userB_fps |
| ---------- | --------- | ----- | --------- | --------- |
| 1          | 261       | true  | 1         | 0         |
| 5          | 1437      | true  | 1         | 1         |
| 10         | 1191      | true  | 1         | 1         |
| 25         | 2009      | true  | 1         | 1         |

- cross-user mixing: NO (each user converges to exactly 1 fingerprint: its own) · connection
  leak: NO (pool health check passes post-run; clean disconnect).

## 8. Memory

| Dataset              | delta                                                                |
| -------------------- | -------------------------------------------------------------------- |
| 100 payers           | 19.95–50.44MB (per-GET window incl. setup-adjacent work)             |
| 1k payers            | 115.91MB                                                             |
| 10k payers           | 296.68MB                                                             |
| 1k / 10k / 50k facts | 91.61MB / GC noise / 49.37MB                                         |
| 100 repeated reads   | batch means [6.25,-0.75,-3.83,0.23,2.03,5.34,3.55,4.55,-0.5,1.94]MB; |
|                      | first-half 0.79MB vs second-half 2.98MB → BOUNDED (no upward trend;  |
|                      | all 100 reads HTTP 200 with identical status). First attempt without |
|                      | pacing tripped the global 100 req/60s throttle (429s) and was        |
|                      | discarded; the paced re-run (~1 read/s) is the valid measurement.    |

## 9. Serialization

| Payers | payload bytes | stringify time | concern |
| ------ | ------------- | -------------- | ------- |
| 1      | 2,960         | 0ms            | NO      |
| 10     | 5,904         | 0ms            | NO      |
| 100    | 82,880        | 0ms            | NO      |
| 1,000  | 748,430       | 7ms            | NO      |
| 10,000 | 7,521,840     | 27ms           | NO      |

Payload grows linearly (~750 bytes/payer, dominated by the payer redutor breakdown and
evidence states); stringify time is negligible against total latency (27ms of ~10.6s at 10k).
No pagination added (contract unchanged): 10k payers is an extreme edge, and 7.2MB remains a
tractable single response.

No pagination added (contract unchanged).

## 10. Fingerprints

- determinism at 1k/10k/50k: PASS (repeat reads byte-identical; E2E-K asserts two-GET equality).
- shuffle invariance (input order): PASS at domain level (4I.2 AC); application grouping is
  canonically sorted by payer/category/item ids.
- mixed-state exclusion: PASS (race test asserts every racy fingerprint ∈ {pre, post}).
