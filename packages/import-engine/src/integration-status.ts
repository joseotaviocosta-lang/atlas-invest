import type { IntegrationAvailability } from './integration-availability';

/**
 * Phase 5P-C — integration status precedence (pure, zero I/O).
 * Phase 5P-D — connection states are now read from the persisted
 * IntegrationConnection row (null = never connected). REVOKED and
 * REQUIRES_REAUTHORIZATION both surface as NEEDS_REAUTH; only
 * AWAITING_AUTHORIZATION has its own status.
 *
 * A single user-facing status derived deterministically from availability,
 * connection, schedule intent and execution outcome. Highest match wins:
 *
 * 1. PREPARING — product not launched here; trumps everything.
 * 2. UNAVAILABLE — capability explicitly off.
 * 3. NEEDS_REAUTH — authorization expired or revoked (persisted
 *    REQUIRES_REAUTHORIZATION or REVOKED).
 * 4. AWAITING_AUTHORIZATION — a connection flow is open but unfinished.
 * 5. SYNCING — a job for this schedule is executing right now.
 * 6. SYNC_ERROR / SYNC_PARTIAL — the newest run ended failed / partial.
 * 7. PENDING_REVIEW — actionable items waiting on the human.
 * 8. NOT_CONNECTED — no connection row exists (or explicit disconnect);
 *    placed above schedule states so an enabled schedule never claims
 *    automatic collection while nothing can execute.
 * 9. SCHEDULED_ACTIVE — enabled, quiet, nothing demanding attention.
 * 10. SCHEDULED_PAUSED — a schedule exists but is disabled.
 * 11. READY — authorized, no schedule yet: user can create one.
 */
export const INTEGRATION_CONNECTION_STATES = [
  'AUTHORIZED',
  'NOT_CONNECTED',
  'NEEDS_REAUTH',
  'AWAITING_AUTHORIZATION',
] as const;
export type IntegrationConnectionState = (typeof INTEGRATION_CONNECTION_STATES)[number];

export const INTEGRATION_STATUSES = [
  'PREPARING',
  'UNAVAILABLE',
  'NEEDS_REAUTH',
  'AWAITING_AUTHORIZATION',
  'SYNCING',
  'SYNC_ERROR',
  'SYNC_PARTIAL',
  'PENDING_REVIEW',
  'NOT_CONNECTED',
  'SCHEDULED_ACTIVE',
  'SCHEDULED_PAUSED',
  'READY',
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

/**
 * Newest completed outcome for this portfolio + source, or null when no
 * run reached a preview yet. OK covers AWAITING_REVIEW and COMPLETED;
 * transient STARTED/CONFIRMING-only histories resolve to null.
 */
export type IntegrationLastRunOutcome = 'FAILED' | 'PARTIAL' | 'OK' | null;

export interface IntegrationStatusInput {
  availability: IntegrationAvailability;
  connection: IntegrationConnectionState;
  /** Whether a schedule row exists for this portfolio + source. */
  hasSchedule: boolean;
  /** Whether that schedule is enabled. */
  scheduleEnabled: boolean;
  /** Whether a job for this schedule is RUNNING right now. */
  hasSyncingJob: boolean;
  /** Newest completed outcome for this portfolio + source, or null. */
  lastRunOutcome: IntegrationLastRunOutcome;
  /** Actionable inbox items for this portfolio + source. */
  pendingReviewCount: number;
}

export function resolveIntegrationStatus(input: IntegrationStatusInput): IntegrationStatus {
  if (input.availability === 'PREPARING') {
    return 'PREPARING';
  }
  if (input.availability === 'UNAVAILABLE') {
    return 'UNAVAILABLE';
  }
  if (input.connection === 'NEEDS_REAUTH') {
    return 'NEEDS_REAUTH';
  }
  if (input.connection === 'AWAITING_AUTHORIZATION') {
    return 'AWAITING_AUTHORIZATION';
  }
  if (input.hasSyncingJob) {
    return 'SYNCING';
  }
  if (input.lastRunOutcome === 'FAILED') {
    return 'SYNC_ERROR';
  }
  if (input.lastRunOutcome === 'PARTIAL') {
    return 'SYNC_PARTIAL';
  }
  if (input.pendingReviewCount > 0) {
    return 'PENDING_REVIEW';
  }
  if (input.connection === 'NOT_CONNECTED') {
    return 'NOT_CONNECTED';
  }
  if (input.hasSchedule) {
    return input.scheduleEnabled ? 'SCHEDULED_ACTIVE' : 'SCHEDULED_PAUSED';
  }
  if (input.connection === 'AUTHORIZED') {
    return 'READY';
  }
  return 'NOT_CONNECTED';
}
