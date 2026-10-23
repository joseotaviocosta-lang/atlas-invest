import type { IntegrationAvailability } from './integration-availability';

/**
 * Phase 5P-C — integration status precedence (pure, zero I/O).
 *
 * A single user-facing status derived deterministically from availability,
 * connection, schedule intent and execution outcome. Highest match wins:
 *
 * 1. PREPARING — product not launched here; trumps everything.
 * 2. UNAVAILABLE — capability explicitly off.
 * 3. NEEDS_REAUTH — authorization expired or revoked. Unreachable while
 *    all executors are simulated-and-implicitly-authorized; asserted so
 *    no future caller can fall through silently.
 * 4. SYNCING — a job for this schedule is executing right now.
 * 5. SYNC_ERROR / SYNC_PARTIAL — the newest run ended failed / partial.
 * 6. PENDING_REVIEW — actionable items waiting on the human.
 * 7. SCHEDULED_ACTIVE — enabled, quiet, nothing demanding attention.
 * 8. SCHEDULED_PAUSED — a schedule exists but is disabled.
 * 9. READY — authorized, no schedule yet: user can create one.
 * 10. NOT_CONNECTED — a source that requires an explicit connection the
 *     user has not established. Unreachable while SIMULATED is the only
 *     environment; asserted for the same reason as NEEDS_REAUTH.
 */
export const INTEGRATION_CONNECTION_STATES = [
  'AUTHORIZED',
  'NOT_CONNECTED',
  'NEEDS_REAUTH',
] as const;
export type IntegrationConnectionState = (typeof INTEGRATION_CONNECTION_STATES)[number];

export const INTEGRATION_STATUSES = [
  'PREPARING',
  'UNAVAILABLE',
  'NEEDS_REAUTH',
  'SYNCING',
  'SYNC_ERROR',
  'SYNC_PARTIAL',
  'PENDING_REVIEW',
  'SCHEDULED_ACTIVE',
  'SCHEDULED_PAUSED',
  'READY',
  'NOT_CONNECTED',
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
  if (input.hasSchedule) {
    return input.scheduleEnabled ? 'SCHEDULED_ACTIVE' : 'SCHEDULED_PAUSED';
  }
  if (input.connection === 'AUTHORIZED') {
    return 'READY';
  }
  return 'NOT_CONNECTED';
}
