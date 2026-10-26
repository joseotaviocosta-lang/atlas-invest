import { DomainError } from '@atlas/domain';

export class InvalidDataQualityInputError extends DomainError {
  constructor(message: string) {
    super(message, 'PORTFOLIO.INVALID_DATA_QUALITY');
    this.name = 'InvalidDataQualityInputError';
  }
}

/**
 * Phase 5R-E — data quality diagnostics (pure, zero I/O).
 *
 * Consolidates facts the read models already produce (valuation statuses,
 * cost-basis states, FX translation state, reconciliation summaries) into
 * operational issues: explicit eligibility, deterministic severity and
 * stable ordering. Facts only.
 */

/** Closed quality vocabulary. INCOME and PERFORMANCE need no domain: zero
 * income and window-specific performance caveats are normal states, never
 * data problems. CLASSIFICATION gaps are structural (portfolio-level). */
export const DATA_QUALITY_DOMAINS = ['MARKET_DATA', 'COST_BASIS', 'FX', 'RECONCILIATION'] as const;
export type DataQualityDomain = (typeof DATA_QUALITY_DOMAINS)[number];

/** Operational priority only — never investment quality. */
export const DATA_QUALITY_SEVERITIES = ['INFO', 'REVIEW', 'BLOCKING'] as const;
export type DataQualitySeverity = (typeof DATA_QUALITY_SEVERITIES)[number];

/** Overall position/portfolio state. LIMITED is reserved for future
 * INFO-level diagnostics; v1 never emits INFO issues. */
export const DATA_QUALITY_STATUSES = ['COMPLETE', 'LIMITED', 'REVIEW_REQUIRED', 'BLOCKED'] as const;
export type DataQualityStatus = (typeof DATA_QUALITY_STATUSES)[number];

export const AFFECTED_CAPABILITIES = [
  'VALUATION',
  'ALLOCATION',
  'UNREALIZED_PNL',
  'REALIZED_PNL',
  'ECONOMIC_PNL',
  'PERFORMANCE',
  'COMPOSITION',
  'REPORTING_VALUE',
  'PORTFOLIO_WEIGHT',
  'RECONCILIATION',
] as const;
export type AffectedCapability = (typeof AFFECTED_CAPABILITIES)[number];

export interface DataQualityAction {
  type: 'VIEW_POSITION' | 'VIEW_REVIEWS';
  assetId: string | null;
}

export interface DataQualityIssueFacts {
  assetId: string | null;
  ticker: string | null;
  asOf: string | null;
  count: number | null;
}

export interface DataQualityIssue {
  code: string;
  domain: DataQualityDomain;
  severity: DataQualitySeverity;
  affectedCapabilities: AffectedCapability[];
  facts: DataQualityIssueFacts;
  actions: DataQualityAction[];
}

interface IssueDescriptor {
  domain: DataQualityDomain;
  severity: DataQualitySeverity;
  affectedCapabilities: AffectedCapability[];
}

/**
 * Explicit eligibility: limitation code -> issue descriptor, or null when
 * the code is a normal state rather than a data problem. Any code not
 * listed here is never a quality issue (closed world).
 */
const ISSUE_DESCRIPTORS: Record<string, IssueDescriptor> = {
  MISSING_PRICE: {
    domain: 'MARKET_DATA',
    severity: 'BLOCKING',
    affectedCapabilities: [
      'VALUATION',
      'ALLOCATION',
      'UNREALIZED_PNL',
      'PERFORMANCE',
      'COMPOSITION',
    ],
  },
  STALE_PRICE: {
    domain: 'MARKET_DATA',
    severity: 'REVIEW',
    affectedCapabilities: ['VALUATION'],
  },
  INCOMPLETE_COST_BASIS: {
    domain: 'COST_BASIS',
    severity: 'BLOCKING',
    affectedCapabilities: ['REALIZED_PNL', 'UNREALIZED_PNL', 'ECONOMIC_PNL'],
  },
  NO_FX_TRANSLATION: {
    domain: 'FX',
    severity: 'REVIEW',
    affectedCapabilities: ['REPORTING_VALUE', 'PORTFOLIO_WEIGHT'],
  },
  MIXED_CURRENCIES_WITHOUT_TRANSLATION: {
    domain: 'FX',
    severity: 'REVIEW',
    affectedCapabilities: ['COMPOSITION', 'REPORTING_VALUE'],
  },
  RECONCILIATION_DIVERGENT: {
    domain: 'RECONCILIATION',
    severity: 'REVIEW',
    affectedCapabilities: ['RECONCILIATION'],
  },
  RECONCILIATION_MISSING_LOCAL: {
    domain: 'RECONCILIATION',
    severity: 'REVIEW',
    affectedCapabilities: ['RECONCILIATION'],
  },
  RECONCILIATION_MISSING_SOURCE: {
    domain: 'RECONCILIATION',
    severity: 'REVIEW',
    affectedCapabilities: ['RECONCILIATION'],
  },
  RECONCILIATION_UNRESOLVED: {
    domain: 'RECONCILIATION',
    severity: 'REVIEW',
    affectedCapabilities: ['RECONCILIATION'],
  },
  PENDING_INTEGRATION_REVIEW: {
    domain: 'RECONCILIATION',
    severity: 'REVIEW',
    affectedCapabilities: ['RECONCILIATION'],
  },
};

/** Normal states below are deliberately absent: NO_INCOME_IN_PERIOD,
 * NO_POSITION_IN_PERIOD, NO_ACTIVITY, NO_INCOME_HISTORY,
 * POSITION_PERFORMANCE_NOT_AVAILABLE, performance window caveats
 * (MISSING_START/END/FLOW_PRICE, STALE_END_PRICE, INSUFFICIENT_HISTORY,
 * POSITION_CONTRIBUTION_NOT_AVAILABLE) and structural classification
 * gaps are never data-quality problems. */
export function isDataQualityIssue(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(ISSUE_DESCRIPTORS, code);
}

export function describeIssue(code: string): IssueDescriptor | null {
  return ISSUE_DESCRIPTORS[code] ?? null;
}

const SEVERITY_RANK: Record<DataQualitySeverity, number> = {
  BLOCKING: 0,
  REVIEW: 1,
  INFO: 2,
};

const DOMAIN_RANK: Record<DataQualityDomain, number> = {
  MARKET_DATA: 0,
  COST_BASIS: 1,
  FX: 2,
  RECONCILIATION: 3,
};

export function buildIssue(input: {
  code: string;
  assetId: string | null;
  ticker: string | null;
  asOf?: string | null;
  count?: number | null;
}): DataQualityIssue | null {
  const descriptor = describeIssue(input.code);
  if (!descriptor) return null;
  const actions: DataQualityAction[] =
    input.assetId !== null
      ? [{ type: 'VIEW_POSITION', assetId: input.assetId }]
      : [{ type: 'VIEW_REVIEWS', assetId: null }];
  return {
    code: input.code,
    domain: descriptor.domain,
    severity: descriptor.severity,
    affectedCapabilities: [...descriptor.affectedCapabilities],
    facts: {
      assetId: input.assetId,
      ticker: input.ticker,
      asOf: input.asOf ?? null,
      count: input.count ?? null,
    },
    actions,
  };
}

/** Deterministic order: severity, domain, code, assetId (nulls last). */
export function sortQualityIssues(issues: readonly DataQualityIssue[]): DataQualityIssue[] {
  return [...issues].sort((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    if (DOMAIN_RANK[a.domain] !== DOMAIN_RANK[b.domain]) {
      return DOMAIN_RANK[a.domain] - DOMAIN_RANK[b.domain];
    }
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    const left = a.facts.assetId ?? '';
    const right = b.facts.assetId ?? '';
    if (left !== right) {
      if (a.facts.assetId === null) return 1;
      if (b.facts.assetId === null) return -1;
      return left < right ? -1 : 1;
    }
    return 0;
  });
}

/** Overall status from explicit rules: any BLOCKING -> BLOCKED, else any
 * REVIEW -> REVIEW_REQUIRED, else any INFO -> LIMITED, else COMPLETE. */
export function deriveQualityStatus(issues: readonly DataQualityIssue[]): DataQualityStatus {
  let sawReview = false;
  let sawInfo = false;
  for (const issue of issues) {
    if (issue.severity === 'BLOCKING') return 'BLOCKED';
    if (issue.severity === 'REVIEW') sawReview = true;
    if (issue.severity === 'INFO') sawInfo = true;
  }
  if (sawReview) return 'REVIEW_REQUIRED';
  return sawInfo ? 'LIMITED' : 'COMPLETE';
}

export function unionCapabilities(issues: readonly DataQualityIssue[]): AffectedCapability[] {
  const seen: AffectedCapability[] = [];
  for (const issue of issues) {
    for (const capability of issue.affectedCapabilities) {
      if (!seen.includes(capability)) seen.push(capability);
    }
  }
  return seen.sort((a, b) => {
    const left = (AFFECTED_CAPABILITIES as readonly string[]).indexOf(a);
    const right = (AFFECTED_CAPABILITIES as readonly string[]).indexOf(b);
    return left - right;
  });
}
