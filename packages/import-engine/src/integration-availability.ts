/**
 * Phase 5P-C — integration availability (pure, zero I/O).
 *
 * Availability is a PRODUCT capability, not a user choice and not an
 * execution outcome: it answers whether this integration may run here at
 * all. It is deliberately separate from:
 * - connection state (whether the source authorized us),
 * - schedule intent (whether the user enabled syncs),
 * - execution state (jobs/runs).
 *
 * Rule: B3 is PREPARING by default. Only an explicit, server-side opt-in
 * flips it to AVAILABLE for simulated execution (dev/test harness). There
 * is deliberately no path to CERT/PROD availability here — that belongs to
 * the future 5P-D CERT integration.
 */

export const INTEGRATION_AVAILABILITIES = ['PREPARING', 'AVAILABLE', 'UNAVAILABLE'] as const;
export type IntegrationAvailability = (typeof INTEGRATION_AVAILABILITIES)[number];

export interface IntegrationAvailabilityInput {
  source: string;
  /**
   * Server-side deployment gate (mirrors the scheduling policy): true only
   * when the environment explicitly allows simulated integrations.
   * Never derived from client input.
   */
  allowSimulated: boolean;
}

/**
 * Resolves product availability for a source. Unknown sources are
 * explicitly UNAVAILABLE (fail closed); known sources stay PREPARING
 * without an explicit opt-in.
 */
export function resolveIntegrationAvailability(
  input: IntegrationAvailabilityInput,
): IntegrationAvailability {
  if (input.source !== 'B3') {
    return 'UNAVAILABLE';
  }
  if (input.allowSimulated) {
    return 'AVAILABLE';
  }
  return 'PREPARING';
}
