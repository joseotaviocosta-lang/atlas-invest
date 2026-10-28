import type { IntegrationRunRow } from '@atlas/database';
import { deriveOperationalRecovery } from '@atlas/portfolio-strategy';

export interface IntegrationRunResponse {
  id: string;
  portfolioId: string;
  source: string;
  provider: string | null;
  environment: string | null;
  fileName: string | null;
  sourceAsOf: string | null;
  status: string;
  counts: {
    fetched: number;
    normalized: number;
    new: number;
    exactDuplicates: number;
    probableDuplicates: number;
    conflicts: number;
    unsupported: number;
    invalid: number;
    confirmed: number;
    ignored: number;
  };
  reconciliation: {
    matched: number;
    divergent: number;
    missingLocal: number;
    missingSource: number;
    unresolved: number;
  } | null;
  partial: boolean;
  /** Phase 5P-A run origin: 'MANUAL' | 'SCHEDULED' | null (pre-5P-A rows). */
  trigger: string | null;
  error: { code: string; message: string } | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  recovery?: {
    recoveryState: string;
    recommendedAction: string;
    canRetry: boolean;
    canResume: boolean;
    requiresReview: boolean;
    reason: string;
  };
}

/**
 * Phase 5P-PRE — run read model. Operational counts and safe error
 * metadata only: no fingerprints, no raw payloads, no secrets, no ledger
 * internals.
 */
export function mapIntegrationRunToResponse(
  row: IntegrationRunRow,
  now?: Date,
): IntegrationRunResponse {
  const clock = now instanceof Date ? now : new Date();
  const recovery = deriveOperationalRecovery(row, clock);
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    source: row.source,
    provider: row.provider,
    environment: row.environment,
    fileName: row.fileName,
    sourceAsOf: row.sourceAsOf,
    status: row.status,
    counts: {
      fetched: row.recordsFetched,
      normalized: row.recordsNormalized,
      new: row.newCandidates,
      exactDuplicates: row.exactDuplicates,
      probableDuplicates: row.probableDuplicates,
      conflicts: row.conflicts,
      unsupported: row.unsupported,
      invalid: row.invalid,
      confirmed: row.confirmed,
      ignored: row.ignored,
    },
    reconciliation: row.reconciliation
      ? {
          matched: row.reconciliation.matched,
          divergent: row.reconciliation.divergent,
          missingLocal: row.reconciliation.missingLocal,
          missingSource: row.reconciliation.missingSource,
          unresolved: row.reconciliation.unresolved,
        }
      : null,
    partial: row.partial,
    trigger: row.trigger,
    error:
      row.status === 'FAILED' && row.errorCode
        ? { code: row.errorCode, message: row.errorMessage ?? '' }
        : null,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    recovery: {
      recoveryState: recovery.recoveryState,
      recommendedAction: recovery.recommendedAction,
      canRetry: recovery.canRetry,
      canResume: recovery.canResume,
      requiresReview: recovery.requiresReview,
      reason: recovery.reason,
    },
  };
}
