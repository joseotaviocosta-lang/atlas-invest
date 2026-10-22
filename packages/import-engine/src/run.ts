/**
 * Phase 5P-PRE — canonical integration-run contract (pure, zero I/O).
 *
 * An IntegrationRun is the operational history of one import or sync
 * execution: B3 sync, CSV import, or a future connector. It records what a
 * source produced, what the pipeline decided, and what the ledger received —
 * without ever duplicating ledger data (counts + fingerprints live here,
 * canonical events live in the Transaction ledger).
 *
 * The run NEVER mutates the ledger: it is metadata written around preview
 * (zero ledger writes) and confirm (real writes via the canonical writer).
 */

import type { ClassifiedCandidate } from './types';

export const INTEGRATION_RUN_SOURCES = ['B3', 'CSV', 'MANUAL'] as const;
export type IntegrationRunSource = (typeof INTEGRATION_RUN_SOURCES)[number];

export const INTEGRATION_RUN_STATUSES = [
  'STARTED',
  'AWAITING_REVIEW',
  'CONFIRMING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
] as const;
export type IntegrationRunStatus = (typeof INTEGRATION_RUN_STATUSES)[number];

export const INTEGRATION_RUN_ENVIRONMENTS = ['SIMULATED', 'CERT', 'PROD'] as const;
export type IntegrationRunEnvironment = (typeof INTEGRATION_RUN_ENVIRONMENTS)[number];

const TERMINAL_RUN_STATUSES: ReadonlySet<IntegrationRunStatus> = new Set([
  'COMPLETED',
  'PARTIAL',
  'FAILED',
]);

export function isTerminalRunStatus(status: IntegrationRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

export class InvalidRunTransitionError extends Error {
  readonly code = 'IMPORT.INVALID_RUN_TRANSITION';
  constructor(
    public readonly from: IntegrationRunStatus,
    public readonly action: string,
  ) {
    super(`Execução em estado final "${from}" não aceita "${action}"`);
    this.name = 'InvalidRunTransitionError';
  }
}

/**
 * Fail-closed lifecycle guard: terminal runs are evidence and reject any
 * further mutation. Non-terminal runs accept preview/confirm/failure updates.
 */
export function assertRunUpdatable(status: IntegrationRunStatus, action: string): void {
  if (isTerminalRunStatus(status)) {
    throw new InvalidRunTransitionError(status, action);
  }
}

export interface IntegrationRunCounts {
  recordsFetched: number;
  recordsNormalized: number;
  newCandidates: number;
  exactDuplicates: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
  confirmed: number;
  ignored: number;
}

export interface IntegrationRunReconciliation {
  matched: number;
  divergent: number;
  missingLocal: number;
  missingSource: number;
  unresolved: number;
}

export interface IntegrationRunSummaryInput {
  recordsFetched: number;
  candidates: readonly ClassifiedCandidate[];
}

/**
 * Derives preview-time counts from classified candidates. Duplicates stay
 * split by kind (exact / probable / conflict) so no audit information is
 * collapsed; the UI may aggregate for display.
 */
export function summarizeRunCandidates(
  input: IntegrationRunSummaryInput,
): Omit<IntegrationRunCounts, 'confirmed' | 'ignored'> {
  let newCandidates = 0;
  let exactDuplicates = 0;
  let probableDuplicates = 0;
  let conflicts = 0;
  let unsupported = 0;
  let invalid = 0;
  for (const candidate of input.candidates) {
    if (candidate.status === 'READY') newCandidates += 1;
    if (candidate.duplicate === 'EXACT_DUPLICATE') exactDuplicates += 1;
    if (candidate.duplicate === 'PROBABLE_DUPLICATE') probableDuplicates += 1;
    if (candidate.duplicate === 'CONFLICT') conflicts += 1;
    if (candidate.status === 'UNSUPPORTED') unsupported += 1;
    if (candidate.status === 'INVALID') invalid += 1;
  }
  return {
    recordsFetched: input.recordsFetched,
    recordsNormalized: input.candidates.length,
    newCandidates,
    exactDuplicates,
    probableDuplicates,
    conflicts,
    unsupported,
    invalid,
  };
}
