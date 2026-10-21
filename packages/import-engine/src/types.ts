/**
 * Phase 5K — Portfolio Import Hub canonical types.
 *
 * Pure transport/normalization vocabulary. No I/O, no persistence.
 * Financial amounts are strict decimal strings (never IEEE-754 floats).
 * Dates are civil `YYYY-MM-DD` strings (never timezone-shifted Timestamps).
 */

export const SUPPORTED_IMPORT_SOURCES = ['GENERIC_CSV'] as const;
export type SupportedImportSource = (typeof SUPPORTED_IMPORT_SOURCES)[number];

/**
 * Future source placeholders. Architecturally compatible with the 5K
 * normalization pipeline, but NOT implemented in Phase 5K.
 */
export const DEFERRED_IMPORT_SOURCES = [
  'GENERIC_XLSX',
  'B3_EXPORTED_FILE',
  'B3_API',
  'XP',
  'RICO',
  'CLEAR',
  'BTG',
  'INTER',
  'OTHER_BROKER',
] as const;
export type DeferredImportSource = (typeof DEFERRED_IMPORT_SOURCES)[number];

/** MVP trade scope: only BUY/SELL flow into canonical positions in 5K. */
export const SUPPORTED_IMPORT_OPERATIONS = ['BUY', 'SELL'] as const;
export type SupportedImportOperation = (typeof SUPPORTED_IMPORT_OPERATIONS)[number];

/**
 * Operations recognized by the template but explicitly deferred in 5K.
 * Rows with these operations parse successfully but are never written.
 */
export const DEFERRED_IMPORT_OPERATIONS = [
  'DIVIDEND',
  'JCP',
  'FII_INCOME',
  'SPLIT',
  'REVERSE_SPLIT',
  'BONUS',
  'SUBSCRIPTION',
  'AMORTIZATION',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'DEPOSIT',
  'WITHDRAWAL',
  'FEE',
  'TAX',
] as const;

export const IMPORT_ROW_STATUSES = [
  'READY',
  'DUPLICATE',
  'AMBIGUOUS_ASSET',
  'INVALID',
  'UNSUPPORTED',
  'NEEDS_REVIEW',
] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export const DUPLICATE_CLASSIFICATIONS = [
  'NEW',
  'EXACT_DUPLICATE',
  'PROBABLE_DUPLICATE',
  'CONFLICT',
] as const;
export type DuplicateClassification = (typeof DUPLICATE_CLASSIFICATIONS)[number];

export const ASSET_RESOLUTIONS = ['RESOLVED', 'AMBIGUOUS', 'NOT_FOUND'] as const;
export type AssetResolution = (typeof ASSET_RESOLUTIONS)[number];

export const ACCOUNT_RESOLUTIONS = ['RESOLVED', 'AMBIGUOUS', 'NOT_FOUND', 'UNSPECIFIED'] as const;
export type AccountResolution = (typeof ACCOUNT_RESOLUTIONS)[number];

export interface ImportIssue {
  code: string;
  field?: string;
  message: string;
}

export interface RawImportRow {
  rowNumber: number;
  cells: Record<string, string>;
}

export interface NormalizedCandidate {
  rowNumber: number;
  tradeDate: string;
  settlementDate?: string;
  ticker: string;
  operation: SupportedImportOperation;
  rawOperation: string;
  quantity: string;
  unitPrice: string;
  fees: string;
  currency: string;
  brokerLabel?: string;
  accountLabel?: string;
  externalId?: string;
  notes?: string;
  status: ImportRowStatus;
  issues: ImportIssue[];
}

export interface AssetRef {
  id: string;
  ticker: string;
  exchange: string;
  status: string;
}

export interface AccountRef {
  id: string;
  name: string;
}

export interface ExistingLedgerRow {
  provider: string | null;
  externalId: string | null;
  assetId: string;
  accountId: string;
  type: string;
  tradeDate: string;
  quantity: string;
  unitPrice: string | null;
  fees: string | null;
  currency: string;
  fingerprint: string;
}

export interface ClassifiedCandidate extends NormalizedCandidate {
  assetId: string | null;
  assetResolution: AssetResolution;
  accountId: string | null;
  accountResolution: AccountResolution;
  fingerprint: string | null;
  duplicate: DuplicateClassification;
  provider: string;
}

export interface ImportSummary {
  totalRows: number;
  ready: number;
  duplicates: number;
  needsReview: number;
  invalid: number;
  unsupported: number;
  ambiguousAssets: number;
}

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
