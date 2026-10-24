import type { IntegrationAvailability } from './integration-availability';
import { DomainError } from '@atlas/domain';

/**
 * Phase 5P-D — persistent integration connection lifecycle (pure, zero I/O).
 *
 * A connection answers "is this portfolio connected to this source?" and
 * nothing else. It is deliberately separate from:
 * - product availability (whether the integration may run here at all),
 * - schedule intent (whether the user enabled syncs),
 * - execution state (jobs/runs: SYNCING/SYNCED/PARTIAL/ERROR live on runs,
 *   never on the connection row).
 *
 * Timestamps are the only history: the current row plus authorizedAt /
 * revokedAt / lastCheckedAt. No event-sourcing, no consent payloads, no
 * tokens, no secrets — those never reach this layer (see STEP 4/16/21).
 */

export const INTEGRATION_CONNECTION_STATUSES = [
  'NOT_CONNECTED',
  'AWAITING_AUTHORIZATION',
  'AUTHORIZED',
  'REQUIRES_REAUTHORIZATION',
  'REVOKED',
] as const;
export type IntegrationConnectionStatus = (typeof INTEGRATION_CONNECTION_STATUSES)[number];

export const INTEGRATION_CONNECTION_EVENTS = [
  'BEGIN_AUTHORIZATION',
  'COMPLETE_AUTHORIZATION',
  'REQUIRE_REAUTHORIZATION',
  'REVOKE',
] as const;
export type IntegrationConnectionEvent = (typeof INTEGRATION_CONNECTION_EVENTS)[number];

export class InvalidIntegrationConnectionTransitionError extends Error {
  readonly code = 'IMPORT.INVALID_CONNECTION';
  constructor(
    public readonly from: string,
    public readonly event: string,
  ) {
    super(`Transição de conexão inválida: ${from} + ${event}`);
    this.name = 'InvalidIntegrationConnectionTransitionError';
  }
}

export class InvalidIntegrationConnectionError extends DomainError {
  constructor(message: string) {
    super(message, 'IMPORT.INVALID_CONNECTION');
    this.name = 'InvalidIntegrationConnectionError';
  }
}

/**
 * Fail-closed transition matrix. Anything not listed throws
 * InvalidIntegrationConnectionTransitionError. Notable rules:
 * - REVOKED → AUTHORIZED directly is invalid (must begin a new flow).
 * - NOT_CONNECTED → REVOKED is invalid (nothing to revoke).
 * - A completed flow is required before AUTHORIZED from any other state.
 * - BEGIN is idempotent from AWAITING_AUTHORIZATION and AUTHORIZED
 *   (repeat taps never duplicate the connection).
 * - REVOKE is idempotent from REVOKED.
 */
const TRANSITIONS: Record<
  IntegrationConnectionStatus,
  Partial<Record<IntegrationConnectionEvent, IntegrationConnectionStatus>>
> = {
  NOT_CONNECTED: {
    BEGIN_AUTHORIZATION: 'AWAITING_AUTHORIZATION',
  },
  AWAITING_AUTHORIZATION: {
    BEGIN_AUTHORIZATION: 'AWAITING_AUTHORIZATION',
    COMPLETE_AUTHORIZATION: 'AUTHORIZED',
    REVOKE: 'REVOKED',
  },
  AUTHORIZED: {
    BEGIN_AUTHORIZATION: 'AUTHORIZED',
    REQUIRE_REAUTHORIZATION: 'REQUIRES_REAUTHORIZATION',
    REVOKE: 'REVOKED',
  },
  REQUIRES_REAUTHORIZATION: {
    BEGIN_AUTHORIZATION: 'AWAITING_AUTHORIZATION',
    REVOKE: 'REVOKED',
  },
  REVOKED: {
    BEGIN_AUTHORIZATION: 'AWAITING_AUTHORIZATION',
    REVOKE: 'REVOKED',
  },
};

export function transitionIntegrationConnection(
  from: IntegrationConnectionStatus,
  event: IntegrationConnectionEvent,
): IntegrationConnectionStatus {
  const to = TRANSITIONS[from]?.[event];
  if (!to) {
    throw new InvalidIntegrationConnectionTransitionError(from, event);
  }
  return to;
}

export interface IntegrationEligibilityInput {
  availability: IntegrationAvailability;
  connectionStatus: IntegrationConnectionStatus | null;
}

/**
 * Scheduler/worker eligibility gate (pure). Execution requires BOTH an
 * available product AND an authorized connection. A missing connection row
 * (null) is fail-closed: not eligible. Revoked, awaiting and re-auth
 * states never execute, even with an enabled schedule — the schedule keeps
 * representing user preference while execution stays blocked.
 */
export function canExecuteIntegration(input: IntegrationEligibilityInput): boolean {
  if (input.availability !== 'AVAILABLE') {
    return false;
  }
  return input.connectionStatus === 'AUTHORIZED';
}
