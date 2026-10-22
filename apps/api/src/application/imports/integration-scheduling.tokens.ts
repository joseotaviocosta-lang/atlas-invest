import { DomainError } from '@atlas/domain';

/**
 * Phase 5P-A — scheduling policy token.
 *
 * Simulated providers must never run on a production schedule by accident.
 * The policy is resolved once at module wiring (never per-request, never
 * from client input) and injected into the schedule service.
 */
export interface IntegrationSchedulingPolicy {
  readonly allowSimulatedSchedules: boolean;
}

export const INTEGRATION_SCHEDULING_POLICY = Symbol('INTEGRATION_SCHEDULING_POLICY');

export function defaultSchedulingPolicy(): IntegrationSchedulingPolicy {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ATLAS_ALLOW_SIMULATED_SCHEDULES !== 'true'
  ) {
    return { allowSimulatedSchedules: false };
  }
  return { allowSimulatedSchedules: true };
}

/**
 * Phase 5P-A — scheduler failure with a safe code and a user-facing
 * message. Never carries payloads, stacks, tokens or PII.
 */
export class ScheduledSyncFailedError extends DomainError {
  constructor(code: string, message: string) {
    super(message, code);
    this.name = 'ScheduledSyncFailedError';
  }
}
