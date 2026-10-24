import { describe, expect, it } from 'vitest';
import {
  canExecuteIntegration,
  INTEGRATION_CONNECTION_EVENTS,
  INTEGRATION_CONNECTION_STATUSES,
  InvalidIntegrationConnectionTransitionError,
  transitionIntegrationConnection,
} from '@atlas/import-engine';

/**
 * Phase 5P-D — connection lifecycle contract (pure).
 *
 * The state machine is total over its documented transitions and
 * fail-closed everywhere else. Execution eligibility needs BOTH an
 * available product AND an authorized connection; anything else —
 * including a missing connection row — blocks execution.
 */
describe('Phase 5P-D: integration connection transitions', () => {
  it('opens a flow from NOT_CONNECTED to AWAITING_AUTHORIZATION', () => {
    expect(transitionIntegrationConnection('NOT_CONNECTED', 'BEGIN_AUTHORIZATION')).toBe(
      'AWAITING_AUTHORIZATION',
    );
  });

  it('completes the simulated flow into AUTHORIZED', () => {
    expect(
      transitionIntegrationConnection('AWAITING_AUTHORIZATION', 'COMPLETE_AUTHORIZATION'),
    ).toBe('AUTHORIZED');
  });

  it('revokes from authorized, awaiting and re-auth states', () => {
    for (const from of [
      'AUTHORIZED',
      'AWAITING_AUTHORIZATION',
      'REQUIRES_REAUTHORIZATION',
    ] as const) {
      expect(transitionIntegrationConnection(from, 'REVOKE')).toBe('REVOKED');
    }
  });

  it('re-authorizes through a fresh begin, never directly', () => {
    expect(transitionIntegrationConnection('REQUIRES_REAUTHORIZATION', 'BEGIN_AUTHORIZATION')).toBe(
      'AWAITING_AUTHORIZATION',
    );
    expect(transitionIntegrationConnection('REVOKED', 'BEGIN_AUTHORIZATION')).toBe(
      'AWAITING_AUTHORIZATION',
    );
  });

  it('marks authorized connections as needing re-authorization', () => {
    expect(transitionIntegrationConnection('AUTHORIZED', 'REQUIRE_REAUTHORIZATION')).toBe(
      'REQUIRES_REAUTHORIZATION',
    );
  });

  it('begin and revoke are idempotent where repeats are harmless', () => {
    expect(transitionIntegrationConnection('AWAITING_AUTHORIZATION', 'BEGIN_AUTHORIZATION')).toBe(
      'AWAITING_AUTHORIZATION',
    );
    expect(transitionIntegrationConnection('AUTHORIZED', 'BEGIN_AUTHORIZATION')).toBe('AUTHORIZED');
    expect(transitionIntegrationConnection('REVOKED', 'REVOKE')).toBe('REVOKED');
  });

  it('fails closed on every invalid transition', () => {
    const invalid: Array<
      [
        Parameters<typeof transitionIntegrationConnection>[0],
        Parameters<typeof transitionIntegrationConnection>[1],
      ]
    > = [
      ['REVOKED', 'COMPLETE_AUTHORIZATION'],
      ['REQUIRES_REAUTHORIZATION', 'COMPLETE_AUTHORIZATION'],
      ['NOT_CONNECTED', 'COMPLETE_AUTHORIZATION'],
      ['NOT_CONNECTED', 'REVOKE'],
      ['NOT_CONNECTED', 'REQUIRE_REAUTHORIZATION'],
      ['AWAITING_AUTHORIZATION', 'REQUIRE_REAUTHORIZATION'],
      ['AUTHORIZED', 'COMPLETE_AUTHORIZATION'],
      ['REVOKED', 'REQUIRE_REAUTHORIZATION'],
    ];
    for (const [from, event] of invalid) {
      expect(() => transitionIntegrationConnection(from, event)).toThrow(
        InvalidIntegrationConnectionTransitionError,
      );
      try {
        transitionIntegrationConnection(from, event);
      } catch (error) {
        expect((error as InvalidIntegrationConnectionTransitionError).code).toBe(
          'IMPORT.INVALID_CONNECTION',
        );
      }
    }
  });

  it('exposes closed status and event vocabularies', () => {
    expect([...INTEGRATION_CONNECTION_STATUSES].sort()).toEqual(
      [
        'AUTHORIZED',
        'AWAITING_AUTHORIZATION',
        'NOT_CONNECTED',
        'REQUIRES_REAUTHORIZATION',
        'REVOKED',
      ].sort(),
    );
    expect([...INTEGRATION_CONNECTION_EVENTS].sort()).toEqual(
      ['BEGIN_AUTHORIZATION', 'COMPLETE_AUTHORIZATION', 'REQUIRE_REAUTHORIZATION', 'REVOKE'].sort(),
    );
  });
});

describe('Phase 5P-D: scheduler eligibility gate', () => {
  it('executes only when available AND authorized', () => {
    expect(
      canExecuteIntegration({ availability: 'AVAILABLE', connectionStatus: 'AUTHORIZED' }),
    ).toBe(true);
  });

  it('blocks every non-authorized connection state', () => {
    for (const connectionStatus of [
      null,
      'NOT_CONNECTED',
      'AWAITING_AUTHORIZATION',
      'REQUIRES_REAUTHORIZATION',
      'REVOKED',
    ] as const) {
      expect(canExecuteIntegration({ availability: 'AVAILABLE', connectionStatus })).toBe(false);
    }
  });

  it('blocks authorized connections while the product is not available', () => {
    for (const availability of ['PREPARING', 'UNAVAILABLE'] as const) {
      expect(canExecuteIntegration({ availability, connectionStatus: 'AUTHORIZED' })).toBe(false);
    }
  });
});
