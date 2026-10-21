import { describe, expect, it } from 'vitest';
import { transitionSyncState, InvalidSyncTransitionError } from '@atlas/import-engine';

describe('Phase 5L: future sync state machine (no scheduler, no persistence)', () => {
  it('walks the happy path from disconnected to synced', () => {
    expect(transitionSyncState('NOT_CONNECTED', 'CONNECT_REQUESTED')).toBe(
      'AWAITING_AUTHORIZATION',
    );
    expect(transitionSyncState('AWAITING_AUTHORIZATION', 'AUTHORIZED')).toBe('AUTHORIZED');
    expect(transitionSyncState('AUTHORIZED', 'SYNC_STARTED')).toBe('SYNCING');
    expect(transitionSyncState('SYNCING', 'SYNC_SUCCEEDED')).toBe('SYNCED');
  });

  it('represents partial syncs, failures and re-authorization explicitly', () => {
    expect(transitionSyncState('SYNCING', 'SYNC_PARTIAL')).toBe('PARTIAL');
    expect(transitionSyncState('SYNCING', 'SYNC_FAILED')).toBe('ERROR');
    expect(transitionSyncState('SYNCING', 'TOKEN_EXPIRED')).toBe('REQUIRES_REAUTHORIZATION');
    expect(transitionSyncState('REQUIRES_REAUTHORIZATION', 'AUTHORIZED')).toBe('AUTHORIZED');
    expect(transitionSyncState('ERROR', 'SYNC_STARTED')).toBe('SYNCING');
    expect(transitionSyncState('SYNCED', 'SYNC_STARTED')).toBe('SYNCING');
  });

  it('revokes and disconnects from every live state', () => {
    for (const from of ['AUTHORIZED', 'SYNCING', 'SYNCED', 'PARTIAL', 'ERROR'] as const) {
      expect(transitionSyncState(from, 'REVOKED')).toBe('REVOKED');
    }
    expect(transitionSyncState('REVOKED', 'CONNECT_REQUESTED')).toBe('AWAITING_AUTHORIZATION');
  });

  it('fails closed on illegal transitions', () => {
    expect(() => transitionSyncState('NOT_CONNECTED', 'SYNC_STARTED')).toThrow(
      InvalidSyncTransitionError,
    );
    expect(() => transitionSyncState('SYNCED', 'AUTHORIZED')).toThrow(InvalidSyncTransitionError);
    try {
      transitionSyncState('NOT_CONNECTED', 'SYNC_SUCCEEDED');
      expect.unreachable();
    } catch (error) {
      expect((error as InvalidSyncTransitionError).code).toBe('IMPORT.INVALID_SYNC_TRANSITION');
    }
  });
});
