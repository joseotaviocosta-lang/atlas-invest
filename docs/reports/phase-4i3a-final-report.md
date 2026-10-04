# PROJECT ATLAS — PHASE 4I.3A — FINAL REPORT

## PERFORMANCE GATE RECONCILIATION & FINAL CLOSURE

---

## GIT

- **base (4I.3 candidate):** `299c9d2873ad556c4b7e26aefe0692d182114118`
- **branch:** `feature/phase-4i3a-performance-gate-closure`
- **phase commit (4I.3A):** `330f494e906def6997dfef26d45a33405d41b2cb`
- **HEAD:** tip of the branch (see git log)
- **worktree:** clean

## BENCHMARK

- **file:** `tests/tax-engine/annual-tax-readiness-scale.test.ts`
- **test:** 'Stress: 10,000 confirmations and revisions scale workload under 1,500ms'
- **old budget:** 1500ms (unchanged — no budget edit)
- **measurement boundary:** one pure `buildAnnualTaxReadinessAssessment` call over a
  pre-built 10,000-requirement / 10,000-confirmation fixture; `Date.now()` delta
- **includes setup:** NO (fixture construction outside timing)
- **includes DB startup:** NO (pure function, 0 queries)
- **includes JIT/module load:** partially (single-shot measurement; mitigated by fix headroom)

## BASELINE 4I.2 (pristine worktree, same machine: Ultra 5 115U, Node v24.21.0, 10 reps + 2 warmups)

- **run count:** 10 · **warmups:** 2
- **min:** 332 · **median:** 406 · **mean:** 416.1 · **p90:** 582 · **p95:** 582 · **max:** 582 ·
  **stddev:** 88.48

## CANDIDATE 4I.3 BEFORE (same machine, 10 reps + 2 warmups)

- **min:** 350 · **median:** 556 · **mean:** 524.6 · **p90:** 682 · **p95:** 682 · **max:** 682 ·
  **stddev:** 112.47

## 4I.3 regression: NO

The readiness engine, its types and the benchmark are byte-identical between 4I.2 (`e75e7cc`)
and 4I.3 (`299c9d2`) — 4I.3 touched only `high-income/*`. The two distributions are statistically
equivalent (same code, same family; delta is machine noise). The vitest-level gate additionally
showed extreme same-code variance on this machine (550ms ↔ 2300ms across runs), including a PASS
inside the pristine 4I.2 worktree.

## ROOT CAUSE

- **classification:** PRE_EXISTING_DEFECT + BENCHMARK_INSTABILITY + ENVIRONMENT_BUDGET_MISMATCH
- **details:** `activeConfirmations.find(...)` executed inside the per-requirement loop is O(n²)
  (~50M closure invocations at 10k). The single-shot `Date.now()` wall-clock assertion with a
  1500ms budget sits inside this machine's noise band (2.7GB free RAM, GC pauses, vitest worker
  overhead vs standalone tsx). Historical budget (5k/1000ms → 10k/1500ms, both 4H.5) predates 4I.x.

## PROFILE

- **top costs:** confirmation linear scans O(n²) dominated; remainder is linear result assembly +
  final JSON content fingerprint
- **N+1:** NO
- **query count:** 0 total (pure function; no Prisma/DB surface anywhere on the path)
- **complexity:** O(n²) before → O(n) after (measured ratios: 1k→5k→10k→20k ≈ 4ms→20ms→42ms→77ms)

## HISTORICAL COMPARISON

- **4H.5 reported:** ~775ms (consistent with the O(n²) code on faster/less-loaded hardware)
- **same harness:** YES · **same operation:** YES · **comparable:** YES (modulo machine variance)

## FIX

- **type:** ALGORITHMIC_OPTIMIZATION
- **files:** `packages/tax-engine/src/annual-irpf/annual-tax-readiness-engine.ts` (5 lookup sites
  → first-match-preserving `Map<scope::subjectId>` index); `scripts/annual-readiness-scale-bench.ts`
  (new deterministic rerun harness); `package.json` (`test:annual-readiness:scale`)
- **semantic behavior changed:** NO — proven by byte-identical assessment fingerprints pre/post fix
  on a mixed READY/STALE 10k fixture, plus the full 4H.5 correctness suites (exact objects,
  statuses, blocking reasons, content fingerprints)

## FINAL BENCHMARK (post-fix, same machine)

- **1k:** ~4ms · **5k:** ~20ms · **10k:** min 34 / median 38 / mean 37.8 / p90 43 / p95 43 / max 43 /
  stddev 3.12 (10 reps) · **20k:** ~77ms · **50k:** median 257 / max 302 (4 reps)
- **10k median:** 38 · **10k p95:** 43 · **10k max:** 43
- **final budget:** 1500ms (unchanged)
- **PASS:** YES (vitest scale file 3/3 runs; full tax-engine suite 49/49 files, 581/581 tests)

## MEMORY

- **1k:** <1MB · **10k:** ~18MB delta last run · **20k:** ~18MB · **50k:** 23.52MB (bounded, released
  per run; no unbounded retention)

## CORRECTNESS

readiness: PASS · requirements: PASS · confirmation authority: PASS · stale behavior: PASS ·
fingerprint: PASS (byte-identical pre/post) · determinism: PASS

## QUERY BUDGET

- **total:** 0 · **per-confirmation:** NO · **per-revision:** NO · **N+1:** NO

## 4I.3 REGRESSION

fixtures: PASS · fuzz: PASS · differential: PASS · properties: PASS · scale: PASS ·
integration: PASS (all inside the post-fix full tax-engine run)

## 4I.2: PASS · 4I.1: PASS (same run)

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

api: PASS · fiscal-api: PASS · security: PASS · architecture: PASS · web: PASS · mobile: PASS ·
ui: PASS · database: PASS · web:e2e: PASS (117) · tax-engine: PASS (49/49 files, 581/581 tests)

## IMPORTANT

tax-engine: **PASS WITHOUT EXCEPTION**

## ROOT / GOVERNANCE

pnpm test: PASS · pnpm build: PASS · pnpm typecheck: PASS · pnpm lint: PASS ·
pnpm format:check: PASS · validate:foundation: PASS · validate:portfolio-engine-rc: PASS

## ARCHITECTURE

tax semantics changed: NO · 4H changed: NO (behavior; algorithmic complexity only) ·
4I.1 changed: NO · 4I.2 changed: NO · 4I.3 semantic change: NO · client math: NO · Tax AI: NO

## FINAL

PERFORMANCE_GATE: READY · BASELINE_COMPARISON: READY · BENCHMARK_VALIDITY: READY ·
REGRESSIONS: READY

REAL_4I3_BLOCKERS: none.

**PHASE 4I.3A: APROVADA**
**PHASE 4I.3: APROVADA DEFINITIVAMENTE**
**PHASE 4I: NÃO APROVADA**

FINAL CHECKPOINT: `330f494e906def6997dfef26d45a33405d41b2cb`
