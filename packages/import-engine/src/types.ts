/**
 * Phase 5K — Portfolio Import Hub canonical types.
 *
 * Pure transport/normalization vocabulary. No I/O, no persistence.
 * Financial amounts are strict decimal strings (never IEEE-754 floats).
 * Dates are civil `YYYY-MM-DD` strings (never timezone-shifted Timestamps).
 */

export const SUPPORTED_IMPORT_SOURCES = ['GENERIC_CSV', 'B3_NEGOTIATION_XLSX'] as const;
export type SupportedImportSource = (typeof SUPPORTED_IMPORT_SOURCES)[number];

export type B3LayoutType =
  | 'B3_NEGOTIATION'
  | 'B3_MOVEMENT'
  | 'B3_EVENTS'
  | 'B3_POSITION'
  | 'B3_ANNUAL_REPORT'
  | 'UNKNOWN';

export interface B3LayoutDetectionResult {
  isB3: boolean;
  layout: B3LayoutType;
  sheetName?: string;
  detectedName: string;
  isSupported: boolean;
  reason?: string;
}

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

/**
 * Importable scope (5K trades + 5M custody transfers + 5O-A income events).
 * BUY/SELL flow into canonical positions as economic events; TRANSFER_IN /
 * TRANSFER_OUT flow as mirrored custody legs (never acquisitions, never
 * disposals); DIVIDEND / JCP / FII_INCOME flow as income events carrying an
 * exact `amount` (never quantities, never prices). Every other operation
 * stays deferred (fail-closed).
 */
export const SUPPORTED_IMPORT_OPERATIONS = [
  'BUY',
  'SELL',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'DIVIDEND',
  'JCP',
  'FII_INCOME',
] as const;
export type SupportedImportOperation = (typeof SUPPORTED_IMPORT_OPERATIONS)[number];

/**
 * Operations recognized by the template but explicitly deferred.
 * Rows with these operations parse successfully but are never written.
 */
export const DEFERRED_IMPORT_OPERATIONS = [
  'SPLIT',
  'REVERSE_SPLIT',
  'BONUS',
  'SUBSCRIPTION',
  'AMORTIZATION',
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
  /**
   * Phase 5M — income value carriage (exact decimal string, never float).
   * Populated by source adapters (e.g. B3 `amount`) for income-family rows.
   * Trades and custody transfers never carry `amount`. Since 5O-A, income
   * rows with a valid `amount` are importable through the canonical writer.
   */
  amount?: string;
  currency: string;
  brokerLabel?: string;
  accountLabel?: string;
  normalizedInstitution?: string;
  externalId?: string;
  notes?: string;
  /**
   * Phase 5L — custody-transfer pairing key. Set by source adapters when a
   * movement belongs to a mirrored pair (e.g. B3 TRANSFERENCIA legs sharing
   * a pairKey). Opaque to the ledger until confirm wiring consumes it.
   */
  transferGroupId?: string;
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
  institutionId?: string;
  institutionName?: string;
}

export interface InstitutionRef {
  id: string;
  name: string;
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
  operationCount: number;
  uniqueAssetCount: number;
  rawNames?: string[];
  status: 'RESOLVED' | 'NEEDS_ACCOUNT' | 'AMBIGUOUS';
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
  /**
   * Phase 5O-A — income value (exact decimal string) carried by DIVIDEND /
   * JCP / FII_INCOME ledger rows. Trades and custody legs persist `null`.
   * Required (never silently omitted) so income dedupe stays fail-closed.
   */
  amount: string | null;
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
