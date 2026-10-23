import type { IntegrationReviewItem } from '@atlas/import-engine';

export type IntegrationReviewActionKind = 'REVIEW_RUN' | 'VIEW_RUN';

export interface IntegrationReviewAction {
  kind: IntegrationReviewActionKind;
  runId: string;
  portfolioId: string;
}

export interface IntegrationReviewResponse {
  id: string;
  runId: string;
  portfolioId: string;
  portfolioName: string | null;
  source: string;
  trigger: string | null;
  status: string;
  severity: string;
  reasonCodes: string[];
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
  action: IntegrationReviewAction;
}

/**
 * Phase 5P-B — review inbox read model. Derived operational facts only:
 * severity, reason codes, counts and safe routing hints. Row internals
 * (hashes, provider keys, payloads), secrets and PII never leave the API.
 */
export function mapIntegrationReviewToResponse(
  item: IntegrationReviewItem,
  portfolioName: string | null,
): IntegrationReviewResponse {
  return {
    id: item.id,
    runId: item.runId,
    portfolioId: item.portfolioId,
    portfolioName,
    source: item.source,
    trigger: item.trigger,
    status: item.status,
    severity: item.severity,
    reasonCodes: [...item.reasonCodes],
    metrics: { ...item.metrics },
    createdAt: item.createdAt,
    action: {
      kind: item.status === 'AWAITING_REVIEW' ? 'REVIEW_RUN' : 'VIEW_RUN',
      runId: item.runId,
      portfolioId: item.portfolioId,
    },
  };
}
