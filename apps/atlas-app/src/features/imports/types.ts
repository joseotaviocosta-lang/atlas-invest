import type { ImportRunStatus, ReviewSeverity } from '@atlas/ui';

export type ClientSourceType =
  | 'GENERIC_CSV'
  | 'B3_NEGOTIATION_XLSX'
  | 'B3_ANNUAL_REPORT_XLSX'
  | 'B3_MOVEMENT_XLSX';

export interface ClientSourceHint {
  sourceType: ClientSourceType;
  formatName: string | null;
}

export type EffectiveRowState = 'importable' | 'skipped' | 'auto_skipped' | 'blocked' | 'pending';

export interface ReviewIssue {
  code: string;
  field?: string;
  message: string;
}

export interface PreviewCandidate {
  rowNumber: number;
  tradeDate: string;
  ticker: string;
  operation: string;
  rawOperation: string;
  quantity: string;
  unitPrice: string;
  fees: string;
  currency: string;
  brokerLabel?: string;
  accountLabel?: string;
  normalizedInstitution?: string;
  externalId?: string;
  notes?: string;
  targetTicker?: string;
  targetQuantity?: string;
  conversionRatio?: string;
  conversionType?: string;
  unsettledExceptionEligible?: boolean;
  status: 'READY' | 'DUPLICATE' | 'AMBIGUOUS_ASSET' | 'INVALID' | 'UNSUPPORTED' | 'NEEDS_REVIEW';
  issues: ReviewIssue[];
  assetId: string | null;
  assetResolution: string;
  accountId: string | null;
  duplicate: 'NEW' | 'EXACT_DUPLICATE' | 'PROBABLE_DUPLICATE' | 'CONFLICT';
  provider: string;
}

export interface PreviewSummary {
  totalRows: number;
  ready: number;
  duplicates: number;
  needsReview: number;
  invalid: number;
  unsupported: number;
  ambiguousAssets: number;
}

export interface UniqueAssetSummary {
  ticker: string;
  rowCount: number;
  assetId: string | null;
  status: 'RESOLVED' | 'NEEDS_MAPPING' | 'AMBIGUOUS';
  name?: string;
  type?: string;
}

export interface UniqueInstitutionSummary {
  rawName: string;
  normalizedName: string;
  institutionId: string | null;
  matchedAccountId: string | null;
  matchedAccountName: string | null;
  rowCount: number;
  operationCount?: number;
  uniqueAssetCount?: number;
  rawNames?: string[];
  status: 'RESOLVED' | 'NEEDS_ACCOUNT' | 'AMBIGUOUS';
}

export interface PreviewResponse {
  sourceType: string;
  provider: string;
  fileName: string;
  runId?: string | null;
  candidates: PreviewCandidate[];
  detectedLayout?: string | null;
  detectedName?: string | null;
  summary: PreviewSummary;
  assetSummary?: UniqueAssetSummary[];
  institutionSummary?: UniqueInstitutionSummary[];
}

export interface PreviewPayload {
  sourceType: ClientSourceType;
  provider?: string;
  fileName: string;
  content: string;
  defaultAccountId?: string;
}

export interface RowDecision {
  rowNumber: number;
  action: 'import' | 'skip';
  assetId?: string;
  accountId?: string;
  resolution?: {
    type: 'PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT';
    reason: string;
    declaredSettlementDate?: string;
  };
}

export interface ConfirmPayload {
  sourceType: ClientSourceType;
  provider?: string;
  fileName: string;
  content: string;
  defaultAccountId?: string;
  decisions: RowDecision[];
  runId?: string;
}

export interface ImportReceipt {
  receiptId: string;
  portfolioId: string;
  provider: string;
  fileName: string;
  totalRows: number;
  created: number;
  skippedDuplicates: number;
  skippedByUser: number;
  failed: Array<{ rowNumber: number; message: string; kind: 'pending-review' | 'unsupported' | 'error' }>;
  pendingReviewCount: number;
  unsupportedCount: number;
  errorCount: number;
  transactionIds: string[];
  confirmedAt: string;
}

export interface ImportRunCounts {
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
}

export interface ImportRunItem {
  id: string;
  portfolioId: string;
  source: string;
  provider: string | null;
  environment: string | null;
  fileName: string | null;
  sourceAsOf: string | null;
  status: ImportRunStatus;
  counts: ImportRunCounts;
  reconciliation: {
    matched: number;
    divergent: number;
    missingLocal: number;
    missingSource: number;
    unresolved: number;
  } | null;
  partial: boolean;
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

export interface ImportRunListResponse {
  data: ImportRunItem[];
  meta: {
    limit: number;
    cursor: string | null;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface ReviewMetrics {
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
}

export interface ReviewItem {
  id: string;
  runId: string;
  portfolioId: string;
  portfolioName: string | null;
  source: string;
  trigger: string | null;
  status: string;
  severity: ReviewSeverity;
  reasonCodes: string[];
  pairReview: { status: string; totalPairs: number; decidedPairs: number };
  metrics: ReviewMetrics;
  createdAt: string;
  action: { kind: 'REVIEW_RUN' | 'VIEW_RUN'; runId: string; portfolioId: string };
}

export interface ReviewListResponse {
  data: ReviewItem[];
  meta: {
    limit: number;
    cursor: string | null;
    nextCursor: string | null;
    hasMore: boolean;
    workflow?: {
      pending: number;
      partiallyResolved: number;
      resolved: number;
    };
  };
}

export interface PendingCountResponse {
  pendingCount: number;
}

export interface LinkedTransactionView {
  transactionId: string;
  type: string | null;
  tradeDate: string | null;
  assetId: string | null;
  ticker: string | null;
  quantity: string | null;
  amount: string | null;
  currency: string | null;
  decision: 'CONFIRM_MATCH' | 'NOT_A_MATCH' | null;
  decidedAt: string | null;
  rectified: boolean;
}

export interface ReviewDetailData {
  item: ReviewItem | null;
  state: 'ACTIONABLE' | 'RESOLVED';
  resolvedReason: string | null;
  portfolioName: string | null;
  linkedTransactions: LinkedTransactionView[];
  linkedTransactionsTruncated: boolean;
  pairReview: { status: string; totalPairs: number; decidedPairs: number };
  limitations: string[];
}

export interface ReconciliationDecisionPayload {
  transactionId: string;
  decision: 'CONFIRM_MATCH' | 'NOT_A_MATCH';
}

export interface ReconciliationDecisionResponse {
  id: string;
  runId: string;
  portfolioId: string;
  source: string;
  decision: 'CONFIRM_MATCH' | 'NOT_A_MATCH';
  localTransactionId: string;
  decidedAt: string;
  decidedByCurrentUser: boolean;
}
