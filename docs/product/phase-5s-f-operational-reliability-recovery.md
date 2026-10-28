# Project Atlas — Phase 5S-F: Operational Reliability & Recovery

## 1. Overview & Objective

Phase 5S-F implements the operational reliability, failure recovery, retry safety, and stale/interrupted work detection layer for Project Atlas.

When an import or sync operation fails, is interrupted, or crashes mid-flight, the system:
1. Distinguishes factual states using deterministic criteria (no guessing, no synthetic facts).
2. Prevents duplicate ledger entries, double-posting, and conflicting decisions.
3. Provides a safe recovery workflow for retryable operations while leaving historical failed runs immutable.
4. Surfaces interrupted and review-required executions in the Operations Center and Import Workspace without exposing sensitive internals.

---

## 2. Canonical IntegrationRun State Machine

`IntegrationRun` represents the immutable operational record of an import or sync pipeline attempt.

### States & Allowed Transitions

```
                    [ START ]
                        │
                        ▼
                   ┌─────────┐
                   │ STARTED │
                   └────┬────┘
                        │
         ┌──────────────┴──────────────┐
         ▼ (preview / analysis ok)     ▼ (preview / analysis fails)
┌─────────────────┐              ┌────────┐
│ AWAITING_REVIEW │              │ FAILED │ ── (terminal)
└────────┬────────┘              └────────┘
         │                             ▲
         ├─────────────────────────────┤ (unrecoverable confirmation error)
         │ (confirm starts)            │
         ▼                             │
   ┌────────────┐                      │
   │ CONFIRMING │ ─────────────────────┘
   └─────┬──────┘
         │
         ├─────────────────────────────┐
         ▼ (all rows confirmed)        ▼ (partial data confirmed)
   ┌───────────┐                 ┌─────────┐
   │ COMPLETED │ ── (terminal)   │ PARTIAL │ ── (terminal)
   └───────────┘                 └─────────┘
```

| From | Event / Trigger | To | Allowed? | Persistence & Guarantees |
|---|---|---|:---:|---|
| `STARTED` | Preview / analysis succeeds | `AWAITING_REVIEW` | Yes | Recorded by `recordPreview`. Zero ledger writes. |
| `STARTED` | Error during fetch/analysis | `FAILED` | Yes | Recorded by `recordFailure`. Terminal timestamp stamped. |
| `AWAITING_REVIEW` | Confirmation begins | `CONFIRMING` | Yes | Transient state during ledger commit. |
| `AWAITING_REVIEW` | Confirmation completes | `COMPLETED` | Yes | All candidate rows posted to ledger; run stamped. |
| `AWAITING_REVIEW` | Partial rows confirmed | `PARTIAL` | Yes | Partial ledger commit; discrepancies audited. |
| `AWAITING_REVIEW` | Unrecoverable error | `FAILED` | Yes | Recorded by `recordFailure`. |
| `CONFIRMING` | Ledger write finishes | `COMPLETED` | Yes | Terminal timestamp stamped. |
| `CONFIRMING` | Ledger partial commit | `PARTIAL` | Yes | Terminal timestamp stamped. |
| `CONFIRMING` | Error during write | `FAILED` | Yes | Recorded by `recordFailure`. |
| `COMPLETED` / `PARTIAL` / `FAILED` | Any further mutation | — | **NO** | Fail-closed rejection: `IMPORT.INVALID_RUN_TRANSITION`. Terminal runs are immutable evidence. |

---

## 3. Terminal vs. In-Flight & Interrupted Work Detection

### Classification
- **Terminal States:** `COMPLETED`, `PARTIAL`, `FAILED`.
  - Immutable once entered.
  - Mandatory `completedAt` timestamp.
- **In-Flight / Non-Terminal States:** `STARTED`, `AWAITING_REVIEW`, `CONFIRMING`.
  - `completedAt` is `null`.

### Staleness & Interruption Contract
1. **`AWAITING_REVIEW` is NEVER Stale:**
   - Awaiting review is an intentional human-wait state. A run may wait days for an investor to inspect candidate trades or discrepancies. Age alone never turns it into a failure.
2. **`STARTED` & `CONFIRMING` Interruption Threshold:**
   - Interactive previews and automated syncs complete within seconds.
   - If a run remains in `STARTED` or `CONFIRMING` for more than `INTERRUPTED_RUN_TIMEOUT_MS` (15 minutes), it is factually classified as `INTERRUPTED`.
   - On server crash or restart, any orphaned run in `STARTED` or `CONFIRMING` past 15 minutes is surfaced to the investor as interrupted. Atlas never assumes silent completion or fabricates terminal records.

---

## 4. Operational Recovery Matrix

The read model `OperationalRecovery` is derived purely from persisted run data:

```ts
export interface OperationalRecovery {
  runId: string;
  portfolioId: string;
  source: string;
  status: string;
  recoveryState: OperationalRecoveryState; // NONE | RETRY_AVAILABLE | REVIEW_REQUIRED | INTERRUPTED | BLOCKED | UNSUPPORTED
  recommendedAction: OperationalRecoveryAction; // NONE | RETRY | VIEW_REVIEW | VIEW_RUN | VIEW_IMPORT
  canRetry: boolean;
  canResume: boolean;
  requiresReview: boolean;
  reason: string;
}
```

| State / Condition | Recovery Status | Recommended Action | `canRetry` | `canResume` | `requiresReview` | User Copy / Explanation |
|---|---|---|:---:|:---:|:---:|---|
| `COMPLETED` | `NONE` | `NONE` | No | No | No | Execução concluída com sucesso. |
| `AWAITING_REVIEW` | `REVIEW_REQUIRED` | `VIEW_REVIEW` | No | Yes | Yes | Execução aguarda revisão humana antes de ser confirmada no livro-razão. |
| `STARTED` / `CONFIRMING` (> 15 min, B3) | `INTERRUPTED` | `RETRY` | Yes | No | No | A execução foi interrompida antes da conclusão. É seguro tentar novamente. |
| `STARTED` / `CONFIRMING` (> 15 min, CSV) | `INTERRUPTED` | `VIEW_IMPORT` | No | No | No | A importação foi interrompida. Inicie uma nova importação na tela de importações. |
| `PARTIAL` | `REVIEW_REQUIRED` | `VIEW_REVIEW` | No | No | Yes | A execução foi concluída parcialmente. Revise os dados importados e as pendências. |
| `FAILED` (`INTEGRATION.SCHEDULED_SYNC_FAILED`) | `RETRY_AVAILABLE` | `RETRY` | Yes | No | No | A sincronização falhou por erro temporário. Você pode tentar novamente. |
| `FAILED` (`INTEGRATION.SCHEDULED_SOURCE_BLOCKED`) | `BLOCKED` | `VIEW_RUN` | No | No | No | A fonte de integração está temporariamente bloqueada. |
| `FAILED` (`INTEGRATION.SCHEDULED_NO_ACCOUNT`) | `BLOCKED` | `VIEW_RUN` | No | No | No | Nenhuma conta cadastrada na carteira para realizar a sincronização. |
| `FAILED` (`INTEGRATION.UNSUPPORTED_SCHEDULED_SOURCE`) | `UNSUPPORTED` | `VIEW_RUN` | No | No | No | Fonte de dados não suportada para sincronização automática. |
| `FAILED` (CSV import error) | `UNSUPPORTED` | `VIEW_IMPORT` | No | No | No | A importação de arquivo falhou. Envie o arquivo novamente na tela de importação. |

---

## 5. Retry Mutation & Idempotency Invariants

Endpoint: `POST /api/v1/portfolios/:portfolioId/imports/runs/:runId/retry`

1. **New Attempt = New IntegrationRun:**
   - Retry never mutates, edits, or deletes the original failed/interrupted run.
   - The historical record remains intact for auditing.
   - The retry initiates a fresh run that starts in `STARTED` and transitions to `AWAITING_REVIEW`.
2. **Zero Direct Ledger Writes:**
   - Sincronização background/retry is preview-only (`ledgerWrites = 0`).
   - The investor confirms candidate transactions through the existing canonical review flow.
3. **Single-Flight Concurrency Protection:**
   - Double-clicks or simultaneous requests for the same `(portfolioId, runId)` are serialized via a single-flight mutex.
   - Concurrent calls await the in-flight attempt and return the exact same new run ID (`runsBefore + 1`).
4. **Anti-Enumeration Ownership:**
   - Cross-portfolio or unowned run retry attempts fail with `404 Not Found` (never revealing run existence via `403`).
5. **Scheduler Overlap Safety:**
   - `IntegrationSchedulerService.tick` verifies `findActiveBySchedule(schedule.id)` before enqueuing.
   - Active running jobs prevent duplicate scheduling (`skippedOverlap >= 1`, `enqueued = 0`).

---

## 6. Known Limitations

1. **In-Memory Payloads (CSV):**
   - Raw CSV file payloads are not persisted in the database. When a CSV import fails or is interrupted, automated background retry without the file is not possible. The investor must re-select the file in the Import Workspace.
2. **No Distributed Distributed Lock Infrastructure:**
   - Single-flight protection is process-bound, backed by the PostgreSQL unique index `(portfolio_id, provider, external_id)` on the transaction ledger.
3. **Real B3 Integration Stays Blocked:**
   - Simulated provider scenarios (`SNAPSHOT_1`) remain offline, deterministic, and credential-free. `CERT_ACCESS_BLOCKED` remains in force.
