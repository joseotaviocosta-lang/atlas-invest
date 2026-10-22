import type { IntegrationRunRow } from '@atlas/database';

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
  error: { code: string; message: string } | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Phase 5P-PRE — run read model. Operational counts and safe error
 * metadata only: no fingerprints, no raw payloads, no secrets, no ledger
 * internals.
 */
export function mapIntegrationRunToResponse(row: IntegrationRunRow): IntegrationRunResponse {
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
    error:
      row.status === 'FAILED' && row.errorCode
        ? { code: row.errorCode, message: row.errorMessage ?? '' }
        : null,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
