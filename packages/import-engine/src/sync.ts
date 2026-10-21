/**
 * Phase 5L — future sync model (types + transition rules only).
 *
 * No scheduler, no network, no persistence, no credentials. The state
 * machine exists so a future 5M simulated sync and the 5O certification
 * client share one fail-closed vocabulary from day one.
 */

export const SYNC_STATES = [
  'NOT_CONNECTED',
  'AWAITING_AUTHORIZATION',
  'AUTHORIZED',
  'SYNCING',
  'SYNCED',
  'PARTIAL',
  'REQUIRES_REAUTHORIZATION',
  'ERROR',
  'REVOKED',
] as const;
export type SyncState = (typeof SYNC_STATES)[number];

export const SYNC_MODES = [
  'INITIAL_BACKFILL',
  'INCREMENTAL',
  'MANUAL_REFRESH',
  'SCHEDULED',
] as const;
export type SyncMode = (typeof SYNC_MODES)[number];

export const SYNC_EVENTS = [
  'CONNECT_REQUESTED',
  'AUTHORIZED',
  'AUTHORIZATION_DENIED',
  'REVOKED',
  'SYNC_STARTED',
  'SYNC_SUCCEEDED',
  'SYNC_PARTIAL',
  'SYNC_FAILED',
  'TOKEN_EXPIRED',
  'DISCONNECT_REQUESTED',
] as const;
export type SyncEvent = (typeof SYNC_EVENTS)[number];

export class InvalidSyncTransitionError extends Error {
  readonly code = 'IMPORT.INVALID_SYNC_TRANSITION';
  constructor(
    public readonly from: SyncState,
    public readonly event: SyncEvent,
  ) {
    super(`Transição de sincronização inválida: ${from} + ${event}`);
    this.name = 'InvalidSyncTransitionError';
  }
}

const TRANSITIONS: Record<SyncState, Partial<Record<SyncEvent, SyncState>>> = {
  NOT_CONNECTED: {
    CONNECT_REQUESTED: 'AWAITING_AUTHORIZATION',
  },
  AWAITING_AUTHORIZATION: {
    AUTHORIZED: 'AUTHORIZED',
    AUTHORIZATION_DENIED: 'NOT_CONNECTED',
    DISCONNECT_REQUESTED: 'NOT_CONNECTED',
  },
  AUTHORIZED: {
    SYNC_STARTED: 'SYNCING',
    TOKEN_EXPIRED: 'REQUIRES_REAUTHORIZATION',
    REVOKED: 'REVOKED',
    DISCONNECT_REQUESTED: 'NOT_CONNECTED',
  },
  SYNCING: {
    SYNC_SUCCEEDED: 'SYNCED',
    SYNC_PARTIAL: 'PARTIAL',
    SYNC_FAILED: 'ERROR',
    TOKEN_EXPIRED: 'REQUIRES_REAUTHORIZATION',
    REVOKED: 'REVOKED',
  },
  SYNCED: {
    SYNC_STARTED: 'SYNCING',
    TOKEN_EXPIRED: 'REQUIRES_REAUTHORIZATION',
    REVOKED: 'REVOKED',
    DISCONNECT_REQUESTED: 'NOT_CONNECTED',
  },
  PARTIAL: {
    SYNC_STARTED: 'SYNCING',
    TOKEN_EXPIRED: 'REQUIRES_REAUTHORIZATION',
    REVOKED: 'REVOKED',
    DISCONNECT_REQUESTED: 'NOT_CONNECTED',
  },
  REQUIRES_REAUTHORIZATION: {
    AUTHORIZED: 'AUTHORIZED',
    REVOKED: 'REVOKED',
    DISCONNECT_REQUESTED: 'NOT_CONNECTED',
  },
  ERROR: {
    SYNC_STARTED: 'SYNCING',
    REVOKED: 'REVOKED',
    DISCONNECT_REQUESTED: 'NOT_CONNECTED',
  },
  REVOKED: {
    CONNECT_REQUESTED: 'AWAITING_AUTHORIZATION',
  },
};

export function transitionSyncState(from: SyncState, event: SyncEvent): SyncState {
  const to = TRANSITIONS[from]?.[event];
  if (!to) {
    throw new InvalidSyncTransitionError(from, event);
  }
  return to;
}
