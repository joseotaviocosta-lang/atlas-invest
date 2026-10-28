# PROJECT ATLAS — PHASE 5S-F-R1
## DISTRIBUTED RETRY SAFETY & STATE-AGE FIDELITY

**Project:** Project Atlas / Atlas Investimentos  
**Branch:** `feature/phase-4l1-contextual-tax-intelligence-foundation`  
**Initial HEAD:** `d599f91`  
**Status:** PASS_5S_F_R1 / PHASE_5S_F_COMPLETE  

---

## 1. Executive Summary

Phase 5S-F-R1 audits and hardens the operational recovery model introduced in Phase 5S-F against two core real-world concurrency and semantic challenges:
1. **State-Age Fidelity:** Proved that measuring `now - startedAt > 15m` on `CONFIRMING` produces a semantic bug (`STATE_AGE_BUG_CONFIRMED`) when an investor deliberate for hours on review before confirming. Since `IntegrationRun` lacks a dedicated `confirmingStartedAt` timestamp, stale age detection for `CONFIRMING` is classified as `CONFIRMING_STALE_DETECTION_UNSUPPORTED` (never marked interrupted by age without factual proof).
2. **Cross-Process Single-Flight Retry:** Replaced process-local exclusivity with PostgreSQL advisory locking (`pg_try_advisory_xact_lock`) plus post-attempt database checks. Concurrent calls across independent API instances or worker processes coalesce to create exactly **one** new attempt (`effective new retry runs = 1`), with both callers returning the factual attempt identity.
3. **Partial & Awaiting Review Semantics:** Corrected `AWAITING_REVIEW` to `canResume: false` (since confirmation is a separate workflow step rather than execution continuation). Aligned `PARTIAL` runs to `VIEW_RUN` because terminal runs do not live in the review inbox.
4. **Scheduler Concurrency & Fencing:** Verified that concurrent scheduler ticks on due slots coalesce to 1 job via `@@unique([scheduleId, scheduledFor])`, and worker lease expiration strictly fences superseded workers from finalizing via optimistic `attempt` guards.

---

## 2. State Timestamps Audit (`IntegrationRun`)

| Field | Written When | Updated When | Semantic Meaning |
| :--- | :--- | :--- | :--- |
| `startedAt` | Initial run creation | Never | Moment when sync/import was initiated. |
| `createdAt` | Initial row creation | Never | Technical database row insertion timestamp. |
| `updatedAt` | Initial row creation | On any record mutation | Technical timestamp of last DB update. |
| `completedAt` | Terminal outcome | Terminal transition | Moment when execution completed, partially finished, or failed. |

### Long-Review Reproduction Case (T4)
- **T0:** `STARTED` at 10:00.
- **T1:** `AWAITING_REVIEW` at 10:01.
- **T2:** User deliberates for 2 hours. User clicks Confirm at 12:00 (`CONFIRMING`).
- **T2 + 10s:** Recovery derivation evaluates run.
- **Old 5S-F Behavior:** Evaluated `now - startedAt = 2h > 15m` → erroneously marked `INTERRUPTED` (`STATE_AGE_BUG_CONFIRMED`).
- **Phase 5S-F-R1 Resolution:** Since no dedicated `confirmingStartedAt` exists without a new schema migration, staleness by age is unsupported for `CONFIRMING`. It is classified as `CONFIRMING_STALE_DETECTION_UNSUPPORTED` and stays in-flight (`NONE`), never falsely marked interrupted.

---

## 3. Distributed Retry Concurrency & Lineage

### Multi-Instance Safety Architecture
- **Process Mutex:** In-memory `retryLocks` Map coalesces simultaneous double-clicks within the same Node.js process.
- **Distributed PostgreSQL Lock:** `PrismaJobLock` acquires `pg_try_advisory_xact_lock` over `deriveAdvisoryLockKey('retry:' + portfolioId + ':' + runId)`.
- **Loser Process Behavior:** The second process polls briefly (up to 3 seconds) for the newly created attempt to become visible in PostgreSQL. It loads and returns the factual `newRunId` created by the winning process.
- **Result:** Exactly **one** new `IntegrationRun` is created in PostgreSQL across all instances (`effective new retry runs = 1`).
- **Restart Safety:** On API restart, checking `createdAt > originalRun.createdAt` prevents duplicate retry creation.
- **Lineage Classification:** Classified as **ephemeral response association** `{ originalRunId, newRunId }` returned to the client; no synthetic database relationships are fabricated.

---

## 4. Error Code Recovery Classification Matrix

| Error Code | Recovery Class | Retry? | Rationale |
| :--- | :--- | :--- | :--- |
| `INTEGRATION.SCHEDULED_SYNC_FAILED` | `RETRY_AVAILABLE` | **Yes** | Transient network or provider timeout on simulated B3 sync. |
| `INTEGRATION.SCHEDULED_SOURCE_BLOCKED` | `BLOCKED` | **No** | Integration source requires human authorization or certificate unblock. |
| `INTEGRATION.SCHEDULED_NO_ACCOUNT` | `BLOCKED` | **No** | Portfolio requires at least one registered account before syncing. |
| `INTEGRATION.UNSUPPORTED_SCHEDULED_SOURCE` | `UNSUPPORTED` | **No** | Source cannot be synced automatically. |
| `CSV` file import failure | `UNSUPPORTED` | **No** | CSV file payload is in-memory only; user must re-submit file in import workspace. |
| Unknown / unhandled error codes | `BLOCKED` | **No** | Conservative fail-closed default; prevents runaway loops. |

---

## 5. Verification & Regressions

- **Recovery Unit Tests (`tests/portfolio-strategy/portfolio-recovery.test.ts`):** 12/12 PASS
- **Recovery API Tests (`tests/api/portfolio-recovery.test.ts`):** 10/10 PASS (covering same-process single-flight, cross-process retry, restart, scheduler dual tick, and worker attempt fencing)
- **Recovery Web Tests (`tests/web/portfolio-recovery.test.ts`):** 5/5 PASS
- **5S API Regressions:**
  - 5S-A Operations Center: PASS
  - 5S-B Reconciliation Decisions: PASS
  - 5S-C Review Workflow & Workspace: PASS
  - 5S-D Maintenance & Rectifications: PASS
  - 5S-E Audit History: PASS
- **Web Full Suite:** 520/520 PASS (74 test files)
- **Typecheck:** 25/25 packages PASS
- **Lint:** PASS (zero errors or warnings)
- **API Build:** PASS
- **Web Build:** PASS (33 static pages optimized, 0 hydration/route errors)
- **Database Migrations:** 43 before, 43 after (delta = 0)
- **Git Policy:** NO PUSH
