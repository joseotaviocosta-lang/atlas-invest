import { DomainError } from '@atlas/domain';
import type { DataQualityIssue, DataQualitySeverity } from './data-quality';

export class InvalidOperationsInputError extends DomainError {
  constructor(message: string) {
    super(message, 'PORTFOLIO.INVALID_OPERATIONS');
    this.name = 'InvalidOperationsInputError';
  }
}

/**
 * Phase 5S-A — operations center derivation (pure, zero I/O).
 *
 * Aggregates already-computed summaries (integration settings, run
 * window, review derivation, 5R-E data quality) into operational
 * attention items. Explicit eligibility, deterministic severity and
 * stable ordering. Facts only.
 * Normal states (no connection, manual cadence, preparing production
 * access, matched reconciliation, clean data) never become items.
 */

export const OPERATIONS_DOMAINS = [
  'SYNC',
  'INTEGRATION',
  'RECONCILIATION',
  'DATA_QUALITY',
] as const;
export type OperationsDomain = (typeof OPERATIONS_DOMAINS)[number];

export const OPERATIONS_STATUSES = ['CLEAR', 'ATTENTION_REQUIRED', 'BLOCKED'] as const;
export type OperationsStatus = (typeof OPERATIONS_STATUSES)[number];

export type OperationsSeverity = DataQualitySeverity;

export interface OperationsAction {
  type:
    | 'VIEW_REVIEWS'
    | 'VIEW_DATA_QUALITY'
    | 'VIEW_INTEGRATION_SETTINGS'
    | 'VIEW_RUN_HISTORY'
    | 'VIEW_IMPORT';
}

export interface OperationsAttentionItem {
  code: string;
  domain: OperationsDomain;
  severity: OperationsSeverity;
  count: number | null;
  facts: {
    source: string | null;
    assetId: string | null;
    at: string | null;
  };
  actions: OperationsAction[];
}

const SEVERITY_RANK: Record<OperationsSeverity, number> = {
  BLOCKING: 0,
  REVIEW: 1,
  INFO: 2,
};

const DOMAIN_RANK: Record<OperationsDomain, number> = {
  SYNC: 0,
  INTEGRATION: 1,
  RECONCILIATION: 2,
  DATA_QUALITY: 3,
};

export interface LatestRunInput {
  source: string;
  status: string;
  at: string | null;
  recoveryState?: string | null;
}

export interface ConnectionInput {
  source: string;
  state: string;
}

export interface ReconciliationInput {
  divergent: number;
  missingLocal: number;
  missingSource: number;
  unresolved: number;
}

export interface OperationsAttentionInput {
  latestRuns: readonly LatestRunInput[];
  connections: readonly ConnectionInput[];
  pendingReviews: number;
  reconciliation: ReconciliationInput;
  /** Position-level quality issues only: portfolio-level reconciliation
   * facts are already covered by the reconciliation summary. */
  qualityIssues: readonly DataQualityIssue[];
}

function dataQualityAttention(issues: readonly DataQualityIssue[]): OperationsAttentionItem[] {
  const byCode = new Map<string, DataQualityIssue[]>();
  for (const issue of issues) {
    const list = byCode.get(issue.code);
    if (list) list.push(issue);
    else byCode.set(issue.code, [issue]);
  }
  const items: OperationsAttentionItem[] = [];
  for (const [code, group] of byCode) {
    const assets = new Set(group.map((issue) => issue.facts.assetId));
    assets.delete(null);
    const severity = group.some((issue) => issue.severity === 'BLOCKING')
      ? 'BLOCKING'
      : group.some((issue) => issue.severity === 'REVIEW')
        ? 'REVIEW'
        : 'INFO';
    items.push({
      code,
      domain: 'DATA_QUALITY',
      severity,
      count: assets.size > 0 ? assets.size : group.length,
      facts: { source: null, assetId: null, at: null },
      actions: [{ type: 'VIEW_DATA_QUALITY' }],
    });
  }
  return items;
}

/**
 * Builds attention items from explicit eligibility only. Structural and
 * normal states (NOT_CONNECTED, manual cadence, preparing production
 * access, COMPLETED runs, MATCHED reconciliation, clean data) produce
 * nothing.
 */
export function buildOperationsAttention(
  input: OperationsAttentionInput,
): OperationsAttentionItem[] {
  const items: OperationsAttentionItem[] = [];

  for (const run of input.latestRuns) {
    if (run.recoveryState === 'INTERRUPTED' || run.status === 'INTERRUPTED') {
      items.push({
        code: 'SYNC_INTERRUPTED',
        domain: 'SYNC',
        severity: 'REVIEW',
        count: 1,
        facts: { source: run.source, assetId: null, at: run.at },
        actions: [{ type: 'VIEW_RUN_HISTORY' }],
      });
    } else if (run.status === 'FAILED') {
      items.push({
        code: 'SYNC_FAILED',
        domain: 'SYNC',
        severity: 'REVIEW',
        count: 1,
        facts: { source: run.source, assetId: null, at: run.at },
        actions: [{ type: 'VIEW_RUN_HISTORY' }],
      });
    } else if (run.status === 'PARTIAL') {
      items.push({
        code: 'SYNC_PARTIAL',
        domain: 'SYNC',
        severity: 'REVIEW',
        count: 1,
        facts: { source: run.source, assetId: null, at: run.at },
        actions: [{ type: 'VIEW_RUN_HISTORY' }],
      });
    }
    // AWAITING_REVIEW is covered once by the PENDING_REVIEWS aggregate
    // below (same operational fact, one item, inbox navigation).
  }

  for (const connection of input.connections) {
    if (connection.state === 'NEEDS_REAUTH') {
      items.push({
        code: 'CONNECTION_NEEDS_REAUTH',
        domain: 'INTEGRATION',
        severity: 'REVIEW',
        count: 1,
        facts: { source: connection.source, assetId: null, at: null },
        actions: [{ type: 'VIEW_INTEGRATION_SETTINGS' }],
      });
    }
  }

  if (input.pendingReviews > 0) {
    items.push({
      code: 'PENDING_REVIEWS',
      domain: 'RECONCILIATION',
      severity: 'REVIEW',
      count: input.pendingReviews,
      facts: { source: null, assetId: null, at: null },
      actions: [{ type: 'VIEW_REVIEWS' }],
    });
  }

  const recon: Array<{ code: string; count: number }> = [
    { code: 'RECONCILIATION_DIVERGENT', count: input.reconciliation.divergent },
    { code: 'RECONCILIATION_MISSING_LOCAL', count: input.reconciliation.missingLocal },
    { code: 'RECONCILIATION_MISSING_SOURCE', count: input.reconciliation.missingSource },
    { code: 'RECONCILIATION_UNRESOLVED', count: input.reconciliation.unresolved },
  ];
  for (const entry of recon) {
    if (entry.count > 0) {
      items.push({
        code: entry.code,
        domain: 'RECONCILIATION',
        severity: 'REVIEW',
        count: entry.count,
        facts: { source: null, assetId: null, at: null },
        actions: [{ type: 'VIEW_REVIEWS' }],
      });
    }
  }

  items.push(...dataQualityAttention(input.qualityIssues));
  return sortOperationsAttention(items);
}

/** Deterministic order: severity, domain, code, source. No recency magic. */
export function sortOperationsAttention(
  items: readonly OperationsAttentionItem[],
): OperationsAttentionItem[] {
  return [...items].sort((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    if (DOMAIN_RANK[a.domain] !== DOMAIN_RANK[b.domain]) {
      return DOMAIN_RANK[a.domain] - DOMAIN_RANK[b.domain];
    }
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    const left = a.facts.source ?? '';
    const right = b.facts.source ?? '';
    return left < right ? -1 : 1;
  });
}

/** BLOCKED iff blocking data impact; failed runs stay REVIEW. Facts only. */
export function deriveOperationsStatus(
  items: readonly OperationsAttentionItem[],
): OperationsStatus {
  let sawAttention = false;
  for (const item of items) {
    if (item.severity === 'BLOCKING') return 'BLOCKED';
    sawAttention = true;
  }
  return sawAttention ? 'ATTENTION_REQUIRED' : 'CLEAR';
}

/** Bounded attention preview: top N plus the total. */
export function previewAttention(
  items: readonly OperationsAttentionItem[],
  limit: number,
): { total: number; preview: OperationsAttentionItem[] } {
  return { total: items.length, preview: items.slice(0, Math.max(0, limit)) };
}
