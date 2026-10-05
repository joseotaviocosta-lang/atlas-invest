# PROJECT ATLAS — PHASE 4I.4A — FINAL REPORT

## APPLICATION SCALE, QUERY STABILITY & FINAL CLOSURE

---

## GIT

- **base (4I.4 candidate):** `942f67dd9b83645de036b9fd1e803666820d408d`
- **branch:** `feature/phase-4i4a-scale-query-closure`
- **phase commit (4I.4A):** `2651b445730810baa87f2dd3324402ce27edc09c`
- **HEAD:** tip of the branch (see git log)
- **worktree:** clean

## ANCESTRY

4I.4 candidate: PASS · 4I.3: PASS · 4I.2: PASS · 4I.1: PASS · 4H: PASS (all exit 0)

## BASELINE

pnpm test: PASS · pnpm build: PASS · pnpm typecheck: PASS · pnpm lint: PASS ·
pnpm format: PASS · foundation: PASS · portfolio RC: PASS ·
test:fiscal-api (40/40, 259/259): PASS · test:tax-engine (49/49, 581/581): PASS

## PAYER SCALE (real PG, full HTTP path, mixed states, 2 warmups, 5 reps)

| Payers | min        | median     | mean           | p95        | max        | queries | memory    |
| ------ | ---------- | ---------- | -------------- | ---------- | ---------- | ------- | --------- |
| 1      | 177–332    | 202–504    | 202.6–490.6    | 244–602    | 244–602    | 93×5    | ~2–24MB   |
| 10     | 166–365    | 178–399    | 200.4–412.2    | 296–457    | 296–457    | 93×5    | ~5–11MB   |
| 100    | 264–374    | 302–410    | 317.8–447      | 371–583    | 371–583    | 93×5    | ~17–50MB  |
| 1,000  | 1050–1538  | 1210–2375  | 1298.8–2223.2  | 1817–3201  | 1817–3201  | 93–94   | ~60–150MB |
| 10,000 | 9031–13838 | 9084–15809 | 9311.8–15545.2 | 9913–16732 | 9913–16732 | 93–96   | ~96–297MB |

Ranges span repeated runs under different host load (heavy unrelated processes share this
machine); the SHAPE is invariant: constant queries, linear-ish latency in the in-memory domain
aggregation. Stale-subset exact at every point (0/0, 2/2, 20/20, 200/200, 2000/2000);
re-read fingerprint stability confirmed at every point; payer identity union exact
(100→100, 1k→1k, 10k→10k). 1/10 payers NOT_APPLICABLE; 100+ INCOMPLETE_REDUCTION_DATA by design.

## EVIDENCE REVISION SCALE (single payer, repo-level writes)

| Revisions | append latency (at target) | current lookup | chain integrity |
| --------- | -------------------------- | -------------- | --------------- |
| 100       | 7ms                        | 3ms            | OK              |
| 1,000     | 10ms                       | 5ms            | OK              |
| 10,000    | 5ms                        | 2ms            | OK              |

Write latency flat across revision depth (indexed identity lookup + single insert).
History integrity at 10k: all preserved, current correct, chain valid, unique ids, fingerprint
correct: PASS.

## ANNUAL FACT SCALE (dividend facts, real path)

| Facts  | min   | median | mean    | p95   | max   | queries | memory   |
| ------ | ----- | ------ | ------- | ----- | ----- | ------- | -------- |
| 1,000  | 963   | 1011   | 1041.6  | 1218  | 1218  | 93×5    | 91.61MB  |
| 10,000 | 8072  | 8342   | 8329    | 8614  | 8614  | 94×5    | GC noise |
| 50,000 | 45369 | 46428  | 46832.8 | 49405 | 49405 | 109–110 | 49.37MB  |

Latency dominated by in-memory domain work (roughly linear), not query count.

## COMBINED SCALE (1k payers + 10k revisions + facts)

median 1347 · p95 1496 · max 1496 · queries 93×5 (canonical shape) · correctness true
(INCOMPLETE_REDUCTION_DATA with valid fingerprints).

## QUERY STABILITY

| Scale      | total   | auth | evidence | portfolios | obligations | ledger | assets | accounts | monthly-fiscal | other |
| ---------- | ------- | ---- | -------- | ---------- | ----------- | ------ | ------ | -------- | -------------- | ----- |
| 1–5 payers | 93      | 2    | 3        | 13         | 1           | 13     | 13     | 12       | 36             | 0     |
| 1k facts   | 93      | 2    | 3        | 13         | 1           | 13     | 13     | 12       | 36             | 0     |
| 10k facts  | 94      | 2    | 3        | 13         | 1           | 13     | 13     | 12       | 36             | 1     |
| 50k facts  | 109–110 | 2    | 3        | 13         | 1           | 13     | 26     | 12       | 36             | 3     |
| 10k payers | 93–96   | 2    | 3        | 13         | 1           | 13     | 13     | 12       | 36             | 0–2   |
| combined   | 93      | 2    | 3        | 13         | 1           | 13     | 13     | 12       | 36             | 0     |

- query count constant: YES (93 through 1k payers / 1k facts; stepwise-bounded beyond).
- per-payer: NO · per-evidence: NO · per-income: NO · per-section: NO · per-revision: NO.
- N+1: NO.
- Stepwise deltas explained: bulk-`in` lists past ~32k bind params split driver-side into
  chunks (proven in isolation: one 50k-id `findByIds` → exactly 2 identical-shape queries;
  13 constant call sites → 13→26); `other` = `SELECT 1` pool-validation queries (no application
  code issues raw SQL — verified by grep). Both driver/infrastructure-level, bounded
  (⌈N/32767⌉ per bulk call site), zero per-entity application queries.

## 93-QUERY AUDIT

- architecturally justified: YES.
- avoidable duplicate loads: NO (within frozen 4H architecture).
- classification: EXPECTED.
- details: the 12-month capital-market loop (pre-existing 4G/4H.3 design) accounts for
  ~84 of 93 queries, all bounded by 12 calendar months × user portfolios. No refactor per §36.

## CONCURRENCY SCALE (100 payers, two users)

| Concurrent | elapsedMs | allOk | userA_fps | userB_fps |
| ---------- | --------- | ----- | --------- | --------- |
| 1          | 261       | true  | 1         | 0         |
| 5          | 1437      | true  | 1         | 1         |
| 10         | 1191      | true  | 1         | 1         |
| 25         | 2009      | true  | 1         | 1         |

- cross-user mixing: NO (each user converges to exactly its own fingerprint).
- connection leak: NO (pool health check passes; clean disconnect).

## SNAPSHOT CONSISTENCY

- source revision during large read: PASS (race test: every racy fingerprint ∈ {pre, post}).
- evidence revision during large read: PASS (same test with evidence write).
- mixed-state: NO (proven by construction + test).

## MEMORY

- 100 payers: ~17–50MB · 1k: ~60–150MB · 10k: ~96–297MB ·
  1k/10k/50k facts: ~92MB / GC noise / ~49MB ·
  100 repeated reads: first-half 0.79MB vs second-half 2.98MB → BOUNDED (all-200, stable status).
- unbounded growth: NO.
- Note: the first retention attempt without pacing tripped the global 100 req/60s throttle
  (429s) and was discarded; the paced re-run (~1 read/s) is the valid measurement.

## SERIALIZATION

| Payers | payload bytes | stringify time | concern |
| ------ | ------------- | -------------- | ------- |
| 1      | 2,960         | 0ms            | NO      |
| 10     | 5,904         | 0ms            | NO      |
| 100    | 82,880        | 0ms            | NO      |
| 1,000  | 748,430       | 7ms            | NO      |
| 10,000 | 7,521,840     | 27ms           | NO      |

Linear (~750 bytes/payer); stringify negligible vs total latency. No pagination (contract unchanged).

## FINGERPRINT

- 1k: PASS · 10k: PASS · 50k: PASS (repeat reads byte-identical).
- shuffle invariance: PASS (domain-level; application grouping canonically sorted).

## API REGRESSION

GET high-income: PASS · POST evidence: PASS · resolve: PASS (22/22 in E2E file, incl. large
decimals without overflow/float coercion and the no-mixed-state race test).

## E2E A–P — 16/16 PASS (+6 edge tests: auth, year validation, resolve-409, payload validation,

large decimals, race consistency)

A: PASS · B: PASS · C: PASS · D: PASS · E: PASS · F: PASS · G: PASS · H: PASS ·
I: PASS · J: PASS · K: PASS · L: PASS · M: PASS · N: PASS · O: PASS · P: PASS — total 16/16.

## CONCURRENCY REGRESSION

identical writes: PASS · conflicting writes: PASS · read+revision: PASS · lost update: NO ·
watermark: PASS · TOCTOU: PASS.

## MIGRATION

clean: PASS · upgrade: PASS · pending: NO · drift: NO (`migrate status`: up to date; DB-vs-schema
diff shows only pre-existing historical index-rename drift, untouched) · orphans: NO.

## SECURITY

raw CPF: NO · client ownership: NO · client authority: NO · cross-user read: NO ·
cross-user write: NO · payer spoofing: NO · evidence spoofing: NO · sensitive logging: NO.

## ARCHITECTURE

4H recomputation: NO · domain math in API: NO · final tax persisted: NO · mutable evidence: NO ·
Prisma in pure engine: NO · client tax math: NO · Tax AI: NO.

## 4I.3: PASS · 4I.2: PASS · 4I.1: PASS

## 4A–4G

4A: PASS · 4B: PASS · 4C: PASS · 4D: PASS · 4E: PASS · 4F: PASS · 4G: PASS

## 4H

4H.2: PASS · 4H.3: PASS · 4H.4: PASS · 4H.5: PASS · 4H.6: PASS

## FINANCIAL

portfolio-engine: PASS · valuation: PASS · performance: PASS · performance-series: PASS ·
risk: PASS · risk-adjusted: PASS · relative-risk: PASS · active-performance: PASS ·
rolling: PASS · tail: PASS · scenario: PASS · benchmark: PASS · rate-benchmark: PASS ·
historical/market-data: PASS · portfolio-intelligence: PASS · domain: PASS

## PLATFORM

api: PASS · fiscal-api: PASS (40/40 files, 261/261 tests) · security: PASS · architecture: PASS ·
web: PASS · mobile: PASS · ui: PASS · database: PASS (17/17 files, 90/90 tests) ·
web:e2e: PASS (117) · tax-engine: PASS (49/49 files, 581/581 tests)

## ROOT / GOVERNANCE

pnpm test: PASS · pnpm build: PASS · pnpm typecheck: PASS · pnpm lint: PASS ·
pnpm format:check: PASS · validate:foundation: PASS · validate:portfolio-engine-rc: PASS

Note: one `validate:foundation` invocation failed transiently under heavy host load with all
constituent suites green individually; the immediate clean re-run passed end-to-end
(environmental flake on a shared host running unrelated CPU-heavy processes, not a code issue).

## CONTRACTS / DOCS

high-income-minimum-tax-foundation-v1: MATCH · high-income-minimum-tax-calculation-v1: MATCH ·
high-income-corporate-redutor-v1: MATCH · high-income-annual-integration-v1: MATCH ·
benchmark report (`phase-4i4a-scale-query-closure.md`): MATCH · AGENTS: MATCH (no change required;
benchmark-only phase adds no durable tax invariant).

## SCOPE

annual application service: IMPLEMENTED (4I.4) · evidence persistence: IMPLEMENTED (4I.4) ·
read API: IMPLEMENTED (4I.4) · write API: IMPLEMENTED (4I.4) · calculation persistence:
NOT IMPLEMENTED · UI: NOT IMPLEMENTED · refund: NOT IMPLEMENTED · DARF: NOT IMPLEMENTED ·
Receita: OUT OF SCOPE · Tax AI: NOT ENABLED

## FINAL

PAYER_SCALE: READY · EVIDENCE_SCALE: READY · FACT_SCALE: READY · QUERY_STABILITY: READY ·
MEMORY: READY · CONCURRENCY: READY · REGRESSIONS: READY

REAL_4I4_SCALE_BLOCKERS: none.

**PHASE 4I.4A: APROVADA**
**PHASE 4I.4: APROVADA DEFINITIVAMENTE**
**PHASE 4I: NÃO APROVADA**

FINAL CHECKPOINT: `2651b445730810baa87f2dd3324402ce27edc09c`
