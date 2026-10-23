/**
 * Phase 5P-B — review inbox derivation (pure, zero I/O).
 *
 * An inbox item is a presentational projection of an IntegrationRun, never
 * a second source of truth: no persisted copy of counts, no read/dismissed
 * flags in this phase. "Resolved" is a property of the real situation
 * (terminal run, superseded failure), never of having viewed a screen.
 *
 * Actionability rules (deterministic, documented):
 * - AWAITING_REVIEW with at least one attention reason → actionable.
 * - AWAITING_REVIEW with zero reasons (e.g. only exact duplicates, nothing
 *   new) → not actionable; nothing for the investor to do.
 * - FAILED → actionable ERROR, unless a NEWER run for the same
 *   (portfolio, source) exists. The newest execution — success, retry or
 *   newer failure — is the current situation; older failures stay in run
 *   history but leave the inbox. At most one actionable failure per
 *   integration. This correlation is presentational only.
 * - COMPLETED / PARTIAL / STARTED / CONFIRMING → never inbox items.
 */

export const REVIEW_REASON_CODES = [
  'NEW_RECORDS',
  'PROBABLE_DUPLICATE',
  'CONFLICT',
  'UNSUPPORTED_RECORD',
  'POSITION_DIVERGENCE',
  'MISSING_LOCAL_POSITION',
  'MISSING_SOURCE_POSITION',
  'UNRESOLVED_POSITION',
  'PARTIAL_SYNC',
  'SYNC_FAILED',
] as const;
export type ReviewReasonCode = (typeof REVIEW_REASON_CODES)[number];

export const REVIEW_SEVERITIES = ['REVIEW', 'WARNING', 'ERROR'] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

const SEVERITY_RANK: Record<ReviewSeverity, number> = {
  REVIEW: 1,
  WARNING: 2,
  ERROR: 3,
};

export interface ReviewRunInput {
  id: string;
  portfolioId: string;
  source: string;
  trigger: string | null;
  status: string;
  newCandidates: number;
  exactDuplicates: number;
  probableDuplicates: number;
  conflicts: number;
  unsupported: number;
  invalid: number;
  partial: boolean;
  reconciliation: {
    matched: number;
    divergent: number;
    missingLocal: number;
    missingSource: number;
    unresolved: number;
  } | null;
  createdAt: string;
}

export interface IntegrationReviewItem {
  /** Stable identity: the underlying run id. */
  id: string;
  runId: string;
  portfolioId: string;
  source: string;
  trigger: string | null;
  status: string;
  severity: ReviewSeverity;
  reasonCodes: ReviewReasonCode[];
  metrics: {
    newRecords: number;
    probableDuplicates: number;
    conflicts: number;
    unsupported: number;
    invalid: number;
    divergent: number;
    missingLocal: number;
    missingSource: number;
    unresolved: number;
    partial: boolean;
  };
  createdAt: string;
}

function reasonsForAwaitingReview(run: ReviewRunInput): ReviewReasonCode[] {
  const reasons: ReviewReasonCode[] = [];
  if (run.newCandidates > 0) reasons.push('NEW_RECORDS');
  if (run.probableDuplicates > 0) reasons.push('PROBABLE_DUPLICATE');
  if (run.conflicts > 0) reasons.push('CONFLICT');
  if (run.unsupported > 0) reasons.push('UNSUPPORTED_RECORD');
  if (run.partial) reasons.push('PARTIAL_SYNC');
  if ((run.reconciliation?.divergent ?? 0) > 0) reasons.push('POSITION_DIVERGENCE');
  if ((run.reconciliation?.missingLocal ?? 0) > 0) reasons.push('MISSING_LOCAL_POSITION');
  if ((run.reconciliation?.missingSource ?? 0) > 0) reasons.push('MISSING_SOURCE_POSITION');
  if ((run.reconciliation?.unresolved ?? 0) > 0) reasons.push('UNRESOLVED_POSITION');
  return reasons;
}

function toItem(
  run: ReviewRunInput,
  severity: ReviewSeverity,
  reasons: ReviewReasonCode[],
): IntegrationReviewItem {
  return {
    id: run.id,
    runId: run.id,
    portfolioId: run.portfolioId,
    source: run.source,
    trigger: run.trigger,
    status: run.status,
    severity,
    reasonCodes: reasons,
    metrics: {
      newRecords: run.newCandidates,
      probableDuplicates: run.probableDuplicates,
      conflicts: run.conflicts,
      unsupported: run.unsupported,
      invalid: run.invalid,
      divergent: run.reconciliation?.divergent ?? 0,
      missingLocal: run.reconciliation?.missingLocal ?? 0,
      missingSource: run.reconciliation?.missingSource ?? 0,
      unresolved: run.reconciliation?.unresolved ?? 0,
      partial: run.partial,
    },
    createdAt: run.createdAt,
  };
}

/**
 * Derives actionable inbox items from run rows. Input order is irrelevant;
 * output is sorted by (severity rank desc, blocking conflict/divergence
 * first, recency desc, id asc for stability).
 */
export function deriveReviewItems(runs: readonly ReviewRunInput[]): IntegrationReviewItem[] {
  const byIntegration = new Map<string, ReviewRunInput[]>();
  for (const run of runs) {
    const key = `${run.portfolioId}:${run.source}`;
    const bucket = byIntegration.get(key);
    if (bucket) {
      bucket.push(run);
    } else {
      byIntegration.set(key, [run]);
    }
  }

  const items: IntegrationReviewItem[] = [];
  for (const run of runs) {
    if (run.status === 'AWAITING_REVIEW') {
      const reasons = reasonsForAwaitingReview(run);
      if (reasons.length === 0) continue;
      const reconciliationIssue =
        (run.reconciliation?.divergent ?? 0) > 0 ||
        (run.reconciliation?.missingLocal ?? 0) > 0 ||
        (run.reconciliation?.missingSource ?? 0) > 0 ||
        (run.reconciliation?.unresolved ?? 0) > 0;
      const severity: ReviewSeverity =
        run.conflicts > 0 ||
        run.probableDuplicates > 0 ||
        run.unsupported > 0 ||
        run.partial ||
        reconciliationIssue
          ? 'WARNING'
          : 'REVIEW';
      items.push(toItem(run, severity, reasons));
      continue;
    }
    if (run.status === 'FAILED') {
      const key = `${run.portfolioId}:${run.source}`;
      const newerExecution = (byIntegration.get(key) ?? []).some(
        (other) => other.id !== run.id && other.createdAt > run.createdAt,
      );
      if (newerExecution) continue;
      items.push(toItem(run, 'ERROR', ['SYNC_FAILED']));
    }
  }

  const blocking = (item: IntegrationReviewItem): number =>
    item.reasonCodes.includes('CONFLICT') || item.reasonCodes.includes('POSITION_DIVERGENCE')
      ? 1
      : 0;
  return items.sort((left, right) => {
    const severity = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
    if (severity !== 0) return severity;
    const blocked = blocking(right) - blocking(left);
    if (blocked !== 0) return blocked;
    if (right.createdAt !== left.createdAt) return right.createdAt < left.createdAt ? -1 : 1;
    return left.id < right.id ? -1 : 1;
  });
}

export const INTEGRATION_ATTENTION_EVENT_VERSION = '1';

export interface IntegrationAttentionEvent {
  /** Contract version for future external-notification consumers. */
  version: typeof INTEGRATION_ATTENTION_EVENT_VERSION;
  type: 'INTEGRATION_REVIEW_REQUIRED';
  portfolioId: string;
  runId: string;
  severity: ReviewSeverity;
  occurredAt: string;
  summaryCode: ReviewReasonCode;
}

/**
 * Phase 5P-B — reusable notification contract (STEP 37).
 *
 * Shapes the event a future email/push phase would consume so it never has
 * to interpret the database directly. Nothing is sent in this phase: no
 * email transport, no push provider, no external webhook. One event per
 * item, keyed by the primary (first) reason code.
 */
export function buildAttentionEvents(
  items: readonly IntegrationReviewItem[],
): IntegrationAttentionEvent[] {
  return items.map((item) => ({
    version: INTEGRATION_ATTENTION_EVENT_VERSION,
    type: 'INTEGRATION_REVIEW_REQUIRED',
    portfolioId: item.portfolioId,
    runId: item.runId,
    severity: item.severity,
    occurredAt: item.createdAt,
    summaryCode: item.reasonCodes[0] ?? 'NEW_RECORDS',
  }));
}
