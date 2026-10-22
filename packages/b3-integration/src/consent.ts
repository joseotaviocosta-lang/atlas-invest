import type { SyncState } from '@atlas/import-engine';

/**
 * Phase 5O-B — investor authorization mapped onto the Atlas sync machine.
 *
 * Application authentication (OAuth client credentials + mTLS) and investor
 * authorization (express consent via the B3 logged area, checked through the
 * Autorização Fintech API) are separate concerns with separate credentials.
 * The Autorização API answers one question — "did the investor authorize
 * data sharing with the fintech?" — modeled here as the minimal verdict
 * derivable from its public description. Full answer shapes require the
 * CERT package (marked UNCONFIRMED where relevant).
 *
 * No state machine changes: the 5L vocabulary already covers the lifecycle.
 */
export const B3_AUTHORIZATION_VERDICTS = ['AUTHORIZED', 'NOT_AUTHORIZED', 'UNKNOWN'] as const;
export type B3AuthorizationVerdict = (typeof B3_AUTHORIZATION_VERDICTS)[number];

const LIVE_STATES: ReadonlySet<SyncState> = new Set([
  'AUTHORIZED',
  'SYNCING',
  'SYNCED',
  'PARTIAL',
  'REQUIRES_REAUTHORIZATION',
  'ERROR',
]);

/**
 * Maps an authorization verdict plus the previous sync state to the next
 * sync state. Previously-authorized connections that lose authorization
 * surface as `REVOKED` (explicit, auditable); never-authorized sources stay
 * `NOT_CONNECTED`; undecidable answers never destroy state — they request
 * re-authorization review from a live state and preserve anything else.
 */
export function mapAuthorizationVerdictToSyncState(
  verdict: B3AuthorizationVerdict,
  previous: SyncState,
): SyncState {
  switch (verdict) {
    case 'AUTHORIZED':
      return 'AUTHORIZED';
    case 'NOT_AUTHORIZED':
      return LIVE_STATES.has(previous) ? 'REVOKED' : 'NOT_CONNECTED';
    case 'UNKNOWN':
      return LIVE_STATES.has(previous) ? 'REQUIRES_REAUTHORIZATION' : previous;
  }
}
