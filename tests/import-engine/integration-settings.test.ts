import { describe, expect, it } from 'vitest';
import { INTEGRATION_AVAILABILITIES, resolveIntegrationAvailability } from '@atlas/import-engine';
import {
  INTEGRATION_CONNECTION_STATES,
  INTEGRATION_STATUSES,
  resolveIntegrationStatus,
  type IntegrationStatusInput,
} from '@atlas/import-engine';

/**
 * Phase 5P-C — settings derivation contract (pure).
 *
 * Availability and the status precedence are total pure functions:
 * every branch is asserted, including states unreachable in the current
 * deployment (marked inline), so future callers cannot fall through
 * silently. No I/O, no clock, no environment access.
 */
describe('Phase 5P-C: integration availability', () => {
  it('defaults to PREPARING without an explicit opt-in', () => {
    expect(resolveIntegrationAvailability({ source: 'B3', allowSimulated: false })).toBe(
      'PREPARING',
    );
  });

  it('is AVAILABLE for B3 when simulated execution is explicitly allowed', () => {
    expect(resolveIntegrationAvailability({ source: 'B3', allowSimulated: true })).toBe(
      'AVAILABLE',
    );
  });

  it('is UNAVAILABLE for unknown sources (fail closed)', () => {
    expect(resolveIntegrationAvailability({ source: 'NOPE', allowSimulated: true })).toBe(
      'UNAVAILABLE',
    );
    expect(resolveIntegrationAvailability({ source: '', allowSimulated: false })).toBe(
      'UNAVAILABLE',
    );
  });

  it('exposes a closed availability vocabulary', () => {
    expect([...INTEGRATION_AVAILABILITIES].sort()).toEqual([
      'AVAILABLE',
      'PREPARING',
      'UNAVAILABLE',
    ]);
  });
});

describe('Phase 5P-C: integration status precedence', () => {
  const base: IntegrationStatusInput = {
    availability: 'AVAILABLE',
    connection: 'AUTHORIZED',
    hasSchedule: true,
    scheduleEnabled: true,
    hasSyncingJob: false,
    lastRunOutcome: null,
    pendingReviewCount: 0,
  };

  it('PREPARING trumps everything, including failures and pending review', () => {
    expect(
      resolveIntegrationStatus({
        ...base,
        availability: 'PREPARING',
        hasSyncingJob: true,
        lastRunOutcome: 'FAILED',
        pendingReviewCount: 5,
      }),
    ).toBe('PREPARING');
  });

  it('UNAVAILABLE trumps execution state (reserved capability-off)', () => {
    expect(
      resolveIntegrationStatus({ ...base, availability: 'UNAVAILABLE', hasSyncingJob: true }),
    ).toBe('UNAVAILABLE');
  });

  it('NEEDS_REAUTH trumps running jobs (unreachable with simulated-only sources)', () => {
    expect(
      resolveIntegrationStatus({ ...base, connection: 'NEEDS_REAUTH', hasSyncingJob: true }),
    ).toBe('NEEDS_REAUTH');
  });

  it('SYNCING wins over a failed or partial last run', () => {
    expect(resolveIntegrationStatus({ ...base, hasSyncingJob: true })).toBe('SYNCING');
    expect(
      resolveIntegrationStatus({ ...base, hasSyncingJob: true, lastRunOutcome: 'FAILED' }),
    ).toBe('SYNCING');
  });

  it('maps terminal outcomes: FAILED before PARTIAL', () => {
    expect(resolveIntegrationStatus({ ...base, lastRunOutcome: 'FAILED' })).toBe('SYNC_ERROR');
    expect(resolveIntegrationStatus({ ...base, lastRunOutcome: 'PARTIAL' })).toBe('SYNC_PARTIAL');
  });

  it('PENDING_REVIEW wins over quiet history and enabled schedules', () => {
    expect(resolveIntegrationStatus({ ...base, pendingReviewCount: 2 })).toBe('PENDING_REVIEW');
    expect(resolveIntegrationStatus({ ...base, pendingReviewCount: 1, lastRunOutcome: 'OK' })).toBe(
      'PENDING_REVIEW',
    );
  });

  it('quiet enabled schedules are active; disabled ones are paused', () => {
    expect(resolveIntegrationStatus(base)).toBe('SCHEDULED_ACTIVE');
    expect(resolveIntegrationStatus({ ...base, scheduleEnabled: false })).toBe('SCHEDULED_PAUSED');
  });

  it('no schedule resolves to READY when authorized, NOT_CONNECTED otherwise', () => {
    expect(resolveIntegrationStatus({ ...base, hasSchedule: false })).toBe('READY');
    expect(
      resolveIntegrationStatus({ ...base, hasSchedule: false, connection: 'NOT_CONNECTED' }),
    ).toBe('NOT_CONNECTED');
  });

  it('error outranks pending review from an older run (documented precedence)', () => {
    expect(
      resolveIntegrationStatus({ ...base, lastRunOutcome: 'FAILED', pendingReviewCount: 3 }),
    ).toBe('SYNC_ERROR');
  });

  it('exposes closed connection and status vocabularies', () => {
    expect([...INTEGRATION_CONNECTION_STATES].sort()).toEqual(
      ['AUTHORIZED', 'NEEDS_REAUTH', 'NOT_CONNECTED'].sort(),
    );
    expect([...INTEGRATION_STATUSES].sort()).toEqual(
      [
        'NEEDS_REAUTH',
        'NOT_CONNECTED',
        'PENDING_REVIEW',
        'PREPARING',
        'READY',
        'SCHEDULED_ACTIVE',
        'SCHEDULED_PAUSED',
        'SYNCING',
        'SYNC_ERROR',
        'SYNC_PARTIAL',
        'UNAVAILABLE',
      ].sort(),
    );
  });
});
