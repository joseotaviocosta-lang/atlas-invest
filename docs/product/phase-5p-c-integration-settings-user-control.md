# Phase 5P-C — Integration Settings & User Control

Status: implementation complete, awaiting owner review/push. B3 CERT (5P) stays blocked.

## Purpose

Turn the 5P-A scheduling infrastructure into real product controls: the
investor understands whether an integration is active, when it runs, what
happened last, and what needs review — and can pause/resume/edit where the
deployment allows it. B3 production stays `PREPARING`; nothing here enables
CERT/PROD.

## Settings model

```text
IntegrationSourceSettings {
  source, provider, environment,
  availability, connection { state },
  canEnable, canDisable, canEditSchedule,
  schedule | null,
  lastRun | null,
  lastSuccessfulRun { id, at } | null,
  pendingReviewCount,
  status
}
```

Persisted: only `IntegrationSchedule` rows (5P-A). Derived: availability,
connection, status, flags, last/last-successful, pending count. The API
mapper shapes dates to ISO; the service returns rows.

## Availability vs connection vs schedule vs execution

```text
PRODUCT AVAILABILITY  — can this run here? (B3: PREPARING default, AVAILABLE
                        only with explicit simulated opt-in; else UNAVAILABLE)
CONNECTION STATE      — AUTHORIZED (simulated B3) / NOT_CONNECTED / NEEDS_REAUTH
USER SYNC SETTINGS    — IntegrationSchedule row (cadence, time, enabled)
EXECUTION STATE       — jobs (RUNNING?) + runs (newest outcome, pending count)
```

`B3 = PREPARING` never mixes with `schedule.enabled = false`: one is
product capability, the other is user choice.

## Status precedence

1. PREPARING · 2. UNAVAILABLE · 3. NEEDS_REAUTH · 4. SYNCING ·
2. SYNC_ERROR / SYNC_PARTIAL · 6. PENDING_REVIEW · 7. SCHEDULED_ACTIVE ·
3. SCHEDULED_PAUSED · 9. READY · 10. NOT_CONNECTED.

Pure `resolveIntegrationStatus`; every branch unit-tested, including
currently-unreachable NEEDS_REAUTH/NOT_CONNECTED. Failed newest runs
outrank older pending items (error first).

## Enable/disable semantics

- Enable → `schedule.enabled = true`, `nextRunAt` recomputed server-side.
- Disable → `schedule.enabled = false`, `nextRunAt = null`. History, runs,
  pending review, ledger: all preserved.
- Disabled schedules are never claimable: `claimDue` joins
  `schedule.enabled = true`; ticks enqueue nothing.
- Disabling during RUNNING does not abort the current job; future runs stop.

## Cadence

`MANUAL_ONLY` (Somente manual, never schedules), `DAILY` (Diária),
`WEEKDAYS` (Dias úteis, segunda–sexta — never called trading days).
No cron expressions in UX; hour/minute via constrained selects (00–23,
00/15/30/45).

## Timezone

Stored IANA value is server truth; display maps `America/Sao_Paulo` →
`Horário de Brasília`. Instants render with explicit `timeZone`, never the
device zone silently.

## Next/last run

- Next: `describeScheduleNextRun` (disabled → Pausada, manual → Sem
  execução automática). Recalculated deterministically on every
  cadence/time/enabled edit (fake-clock tested in 5P-A, recompute asserted
  in 5P-C E2E).
- Last: newest run for (portfolio, source) with date + trigger
  (automática/manual) + outcome (concluída/parcial/falhou/aguardando revisão).
- Last successful: newest COMPLETED/AWAITING_REVIEW/PARTIAL; shown
  distinctly when the latest attempt failed.

## Pending review integration

Count via shared `deriveReviewItems` over the source's recent runs; CTA
`N itens aguardam revisão — Revisar agora` → `/reviews?portfolioId=`.
No duplicated list inside settings.

## History

`Ver histórico` anchors to `#import-history` (existing run-history
section); failure/partial lines link `Ver detalhes` to the same anchor.
No second history implementation.

## Security

- Ownership: portfolio scoped to principal; foreign → 404.
- PATCH/POST DTOs strict: `source/provider/environment/nextRunAt/lastRunAt`
  rejected on write; server owns provider (`SIMULATED`), environment
  (`SIMULATED`), `nextRunAt` calculation.
- Production B3 guard: enabling simulated schedules rejected unless
  `ATLAS_ALLOW_SIMULATED_SCHEDULES=true` (service-level, unit-tested);
  capability flags are UX hints only.

## B3 PREPARING behavior

Default deployment: availability PREPARING → status PREPARING, schedule
section informative, controls disabled (`canEnable/canEdit = false`,
`canDisable` only when a row is enabled). Simulated dev/test opt-in flips
to AVAILABLE/READY for exercising settings without touching CERT/PROD.

## Future CERT handoff

Availability has no CERT/PROD path by design; connection for real sources
belongs to the future 5P-D connection layer (AUTHORIZED/NOT_CONNECTED/
NEEDS_REAUTH already modeled, unreachable branches asserted so 5P-D cannot
fall through silently). CERT calls = 0, PROD calls = 0, OAuth = 0, mTLS = 0.

## Verification

- `tests/import-engine/integration-settings.test.ts` — 14 (availability + full precedence ladder).
- `tests/api/integration-settings.test.ts` — 13 E2E (read, default-disabled,
  enable flip, invalid/timezone/injection rejection, WEEKDAYS + time update +
  nextRunAt recompute, MANUAL_ONLY, last vs last-successful, SYNC_ERROR,
  SYNC_PARTIAL, SYNCING, B3-lifecycle confirm clearing, disable semantics +
  unclaimable pending job, PATCH injection, ownership).
- `tests/api/integration-settings-policy.test.ts` — 6 (capability flags,
  PREPARING gating, disable-always-safe, last-success, SYNCING, pending).
- `tests/web/integration-settings.test.ts` — 11 (copy/tone, timezone,
  section/cards/CTAs, states, a11y labels, mobile-safe, server-driven copy).
- `tests/mobile/integration-settings.test.ts` — 2 (contract compat, read-only).
- `tests/architecture/integration-settings-boundaries.test.ts` — 6 (engine
  purity, no ledger/B3/fiscal/UI in path, no scheduler/B3 in web, no new
  tables, ownership + read-only).
- Regression: scheduler (5P-A), inbox (5P-B), run history, CSV/manual green;
  full gates per report.
