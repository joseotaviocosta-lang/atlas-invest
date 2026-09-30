import { LocalDate, Money } from '@atlas/domain';
import type { FiscalCompetence } from './competence';
import { compareFiscalCompetence } from './competence';
import type { FiscalDataQualityIssue, TaxAssetCategory } from './types';

/**
 * Phase 4B.2 — canonical tax input foundation.
 *
 * This module REPRESENTS the source facts that later verified tax rules need
 * (trade classification, withholding/IRRF, FII tax-condition metadata). It
 * performs NO tax calculation, NO rate/threshold logic and NEVER infers a
 * legally material fact heuristically. Unknown remains unknown (ADR-249/253).
 */

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export interface TaxInputProvenance {
  /** Free-form canonical source system (e.g. `BROKER_IMPORT`). */
  readonly source: string;
  readonly sourceReference?: string;
  /** ISO timestamp of record creation/acquisition. */
  readonly recordedAt?: string;
  /** ISO timestamp of explicit manual confirmation, when applicable. */
  readonly manualConfirmedAt?: string;
  readonly effectiveCompetence?: string;
}

// ---------------------------------------------------------------------------
// A. Trade classification
// ---------------------------------------------------------------------------

export const TAX_TRADE_CLASSIFICATIONS = ['NORMAL', 'DAY_TRADE', 'UNKNOWN'] as const;
export type TaxTradeClassificationValue = (typeof TAX_TRADE_CLASSIFICATIONS)[number];

export const TRADE_CLASSIFICATION_SOURCES = [
  'BROKER_IMPORT',
  'CANONICAL_LEDGER',
  'MANUAL_CONFIRMED',
] as const;
export type TradeClassificationSource = (typeof TRADE_CLASSIFICATION_SOURCES)[number];

export interface TaxTradeClassification {
  readonly transactionId: string;
  readonly classification: TaxTradeClassificationValue;
  readonly source: TradeClassificationSource;
  readonly sourceReference?: string;
  readonly classifiedAt?: string;
  readonly classificationVersion: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateTaxTradeClassification(input: TaxTradeClassification): ValidationResult {
  const errors: string[] = [];
  if (!input.transactionId || input.transactionId.trim().length === 0) {
    errors.push('transactionId is required');
  }
  if (!TAX_TRADE_CLASSIFICATIONS.includes(input.classification)) {
    errors.push(`Unknown trade classification '${input.classification}'`);
  }
  if (!TRADE_CLASSIFICATION_SOURCES.includes(input.source)) {
    errors.push(`Unknown trade classification source '${input.source}'`);
  }
  // A legally material classification (NORMAL/DAY_TRADE) requires provenance.
  if (
    input.classification !== 'UNKNOWN' &&
    (!input.sourceReference || input.sourceReference.trim().length === 0)
  ) {
    errors.push('A concrete trade classification requires a sourceReference');
  }
  return { valid: errors.length === 0, errors: Object.freeze(errors) };
}

// ---------------------------------------------------------------------------
// B. Withholding / IRRF input
// ---------------------------------------------------------------------------

export const TAX_WITHHOLDING_STATUSES = ['CONFIRMED', 'UNVERIFIED', 'UNKNOWN'] as const;
export type TaxWithholdingStatus = (typeof TAX_WITHHOLDING_STATUSES)[number];

export const TAX_WITHHOLDING_SOURCE_TYPES = [
  'BROKER_IMPORT',
  'TRANSACTION_METADATA',
  'MANUAL',
  'OTHER_CANONICAL',
] as const;
export type TaxWithholdingSourceType = (typeof TAX_WITHHOLDING_SOURCE_TYPES)[number];

/**
 * Phase 4G.2B.0 — withholding treatment category (IRRF pool classifier).
 *
 * Separate from `TaxAssetCategory`: `BRAZILIAN_EQUITY` is the broad asset
 * category, while this discriminator identifies the IRRF pool
 * (`EQUITY_NORMAL` → EQUITY_NORMAL_IRRF, `EQUITY_DAY_TRADE` → EQUITY_DAY_TRADE_IRRF).
 * It must be explicit source data — never inferred from free text or amounts.
 */
export const TAX_WITHHOLDING_CATEGORIES = ['EQUITY_NORMAL', 'EQUITY_DAY_TRADE'] as const;
export type TaxWithholdingCategory = (typeof TAX_WITHHOLDING_CATEGORIES)[number];

export function isTaxWithholdingCategory(value: unknown): value is TaxWithholdingCategory {
  return (
    typeof value === 'string' && (TAX_WITHHOLDING_CATEGORIES as readonly string[]).includes(value)
  );
}

/** Brazilian equity IRRF requires an explicit withholding category (fail-closed otherwise). */
export function requiresWithholdingCategory(category: TaxAssetCategory): boolean {
  return category === 'BRAZILIAN_EQUITY';
}

export interface TaxWithholdingInput {
  readonly id: string;
  readonly taxSubjectId?: string;
  readonly sourceReference: string;
  readonly sourceType: TaxWithholdingSourceType;
  readonly economicDate: LocalDate;
  readonly competence: FiscalCompetence;
  readonly category: TaxAssetCategory;
  /** Explicit IRRF pool classifier. Required for `BRAZILIAN_EQUITY` evidence. */
  readonly withholdingCategory?: TaxWithholdingCategory;
  readonly currency: string;
  /** Exact amount; required unless status is UNKNOWN (never fabricated). */
  readonly amount?: Money;
  readonly status: TaxWithholdingStatus;
  readonly provenance: TaxInputProvenance;
}

export function validateTaxWithholdingInput(input: TaxWithholdingInput): ValidationResult {
  const errors: string[] = [];
  if (!input.id || input.id.trim().length === 0) errors.push('id is required');
  if (!input.sourceReference || input.sourceReference.trim().length === 0) {
    errors.push('sourceReference is required');
  }
  if (!TAX_WITHHOLDING_SOURCE_TYPES.includes(input.sourceType)) {
    errors.push(`Unknown withholding sourceType '${input.sourceType}'`);
  }
  if (!TAX_WITHHOLDING_STATUSES.includes(input.status)) {
    errors.push(`Unknown withholding status '${input.status}'`);
  }
  if (input.currency.trim().length === 0) errors.push('currency is explicit and required');
  if (requiresWithholdingCategory(input.category)) {
    if (input.withholdingCategory === undefined) {
      errors.push('withholdingCategory is required for BRAZILIAN_EQUITY withholding evidence');
    } else if (!isTaxWithholdingCategory(input.withholdingCategory)) {
      errors.push(`Unknown withholdingCategory '${input.withholdingCategory}'`);
    }
  } else if (input.withholdingCategory !== undefined) {
    errors.push('withholdingCategory is only supported for BRAZILIAN_EQUITY withholding evidence');
  }
  if (input.status === 'UNKNOWN') {
    if (input.amount !== undefined) {
      errors.push('UNKNOWN withholding must not carry an amount');
    }
  } else {
    if (!input.amount) {
      errors.push('amount is required for CONFIRMED/UNVERIFIED withholding');
    } else {
      if (input.amount.isNegative()) errors.push('withholding amount must not be negative');
      if (input.amount.currency !== input.currency) {
        errors.push('amount currency must match the declared currency');
      }
    }
  }
  return { valid: errors.length === 0, errors: Object.freeze(errors) };
}

/** Exact-decimal-safe summary used by readiness/aggregation. */
export function withholdingConfirmedTotal(
  inputs: readonly TaxWithholdingInput[],
  currency: string,
): Money {
  let total = Money.zero(currency);
  for (const input of inputs) {
    if (input.status !== 'CONFIRMED') continue;
    if (input.currency !== currency) continue;
    if (!input.amount) continue;
    total = total.add(input.amount);
  }
  return total;
}

// ---------------------------------------------------------------------------
// C. FII tax-condition metadata (factual input, not tax treatment)
// ---------------------------------------------------------------------------

export const FII_TAX_ELIGIBILITY_STATUSES = ['KNOWN', 'PARTIAL', 'UNKNOWN'] as const;
export type FiiTaxEligibilityStatus = (typeof FII_TAX_ELIGIBILITY_STATUSES)[number];

export const FII_TAX_METADATA_SOURCES = [
  'OFFICIAL_FUND_DATA',
  'BROKER_IMPORT',
  'MANUAL_CONFIRMED',
  'OTHER_CANONICAL',
] as const;
export type FiiTaxMetadataSource = (typeof FII_TAX_METADATA_SOURCES)[number];

const OWNERSHIP_PATTERN = /^\d{1,3}(\.\d+)?$/;

export interface FiiTaxEligibilityFacts {
  readonly assetId: string;
  readonly asOfDate: LocalDate;
  /** Number of quota holders, when officially known (integer). */
  readonly holderCount?: number;
  /** Investor ownership share, exact decimal string (e.g. `'2.5'`). */
  readonly investorOwnershipPercent?: string;
  readonly isExchangeTraded?: boolean;
  readonly source: FiiTaxMetadataSource;
  readonly status: FiiTaxEligibilityStatus;
  readonly provenance: TaxInputProvenance;
}

export function isValidOwnershipPercent(value: string): boolean {
  return OWNERSHIP_PATTERN.test(value) && Number(value) <= 100;
}

export function validateFiiTaxEligibilityFacts(input: FiiTaxEligibilityFacts): ValidationResult {
  const errors: string[] = [];
  if (!input.assetId || input.assetId.trim().length === 0) errors.push('assetId is required');
  if (!FII_TAX_ELIGIBILITY_STATUSES.includes(input.status)) {
    errors.push(`Unknown FII eligibility status '${input.status}'`);
  }
  if (!FII_TAX_METADATA_SOURCES.includes(input.source)) {
    errors.push(`Unknown FII metadata source '${input.source}'`);
  }
  if (
    input.holderCount !== undefined &&
    (!Number.isInteger(input.holderCount) || input.holderCount < 0)
  ) {
    errors.push('holderCount must be a non-negative integer');
  }
  if (
    input.investorOwnershipPercent !== undefined &&
    !isValidOwnershipPercent(input.investorOwnershipPercent)
  ) {
    errors.push('investorOwnershipPercent must be an exact decimal in [0, 100]');
  }
  if (input.status === 'KNOWN') {
    if (input.holderCount === undefined) errors.push('KNOWN FII facts require holderCount');
    if (input.investorOwnershipPercent === undefined) {
      errors.push('KNOWN FII facts require investorOwnershipPercent');
    }
    if (input.isExchangeTraded === undefined)
      errors.push('KNOWN FII facts require isExchangeTraded');
  }
  if (input.status === 'UNKNOWN') {
    if (
      input.holderCount !== undefined ||
      input.investorOwnershipPercent !== undefined ||
      input.isExchangeTraded !== undefined
    ) {
      errors.push('UNKNOWN FII facts must not carry guessed values');
    }
  }
  return { valid: errors.length === 0, errors: Object.freeze(errors) };
}

// ---------------------------------------------------------------------------
// D. Tax input readiness (server-side, no tax arithmetic)
// ---------------------------------------------------------------------------

export const TAX_INPUT_READINESS_STATUSES = [
  'COMPLETE',
  'PARTIAL',
  'MISSING',
  'UNKNOWN',
  'NOT_REQUIRED',
] as const;
export type TaxInputReadinessStatus = (typeof TAX_INPUT_READINESS_STATUSES)[number];

export interface TaxInputReadinessInput {
  readonly competence: FiscalCompetence;
  readonly requiredTradeClassificationTransactionIds?: readonly string[];
  readonly tradeClassifications?: readonly TaxTradeClassification[];
  readonly requiresWithholding?: boolean;
  readonly withholdingInputs?: readonly TaxWithholdingInput[];
  readonly requiresFiiMetadata?: boolean;
  readonly fiiFacts?: readonly FiiTaxEligibilityFacts[];
  /** Reference date used for FII metadata staleness; defaults to none. */
  readonly asOfDate?: LocalDate;
  readonly fiiStalenessDays?: number;
}

export interface TaxInputReadiness {
  readonly competence: FiscalCompetence;
  readonly tradeClassificationStatus: TaxInputReadinessStatus;
  readonly withholdingStatus: TaxInputReadinessStatus;
  readonly fiiMetadataStatus: TaxInputReadinessStatus;
  readonly issues: readonly FiscalDataQualityIssue[];
  readonly capabilities: {
    readonly tradeClassificationComplete: boolean;
    readonly withholdingComplete: boolean;
    readonly fiiMetadataComplete: boolean;
  };
  readonly classificationCoverage: {
    readonly required: number;
    readonly classified: number;
    readonly unknown: number;
  };
  readonly provenanceReferences: readonly string[];
}

export function evaluateTaxInputReadiness(input: TaxInputReadinessInput): TaxInputReadiness {
  const issues = new Set<FiscalDataQualityIssue>();
  const provenanceReferences: string[] = [];

  // --- Trade classification ---
  const required = input.requiredTradeClassificationTransactionIds ?? [];
  const byTx = new Map<string, TaxTradeClassification>();
  for (const classification of input.tradeClassifications ?? []) {
    byTx.set(classification.transactionId, classification);
    if (classification.sourceReference) provenanceReferences.push(classification.sourceReference);
  }
  let classified = 0;
  let unknown = 0;
  for (const txId of required) {
    const found = byTx.get(txId);
    if (!found || found.classification === 'UNKNOWN') unknown += 1;
    else classified += 1;
  }
  let tradeClassificationStatus: TaxInputReadinessStatus;
  if (required.length === 0) tradeClassificationStatus = 'NOT_REQUIRED';
  else if (classified === required.length) tradeClassificationStatus = 'COMPLETE';
  else if (classified > 0) tradeClassificationStatus = 'PARTIAL';
  else tradeClassificationStatus = unknown > 0 ? 'UNKNOWN' : 'MISSING';
  if (unknown > 0 || (required.length > 0 && classified < required.length)) {
    issues.add('UNKNOWN_TRADE_CLASSIFICATION');
  }

  // --- Withholding ---
  const withholdingInputs = input.withholdingInputs ?? [];
  let withholdingStatus: TaxInputReadinessStatus;
  if (!input.requiresWithholding) {
    withholdingStatus = 'NOT_REQUIRED';
  } else if (withholdingInputs.length === 0) {
    withholdingStatus = 'MISSING';
    issues.add('MISSING_WITHHOLDING_INPUT');
  } else {
    const confirmed = withholdingInputs.filter((w) => w.status === 'CONFIRMED');
    for (const w of withholdingInputs) provenanceReferences.push(w.sourceReference);
    if (confirmed.length === withholdingInputs.length) withholdingStatus = 'COMPLETE';
    else {
      withholdingStatus = 'PARTIAL';
      issues.add('UNVERIFIED_WITHHOLDING');
    }
  }

  // --- FII metadata ---
  const fiiFacts = input.fiiFacts ?? [];
  let fiiMetadataStatus: TaxInputReadinessStatus;
  if (!input.requiresFiiMetadata) {
    fiiMetadataStatus = 'NOT_REQUIRED';
  } else if (fiiFacts.length === 0) {
    fiiMetadataStatus = 'MISSING';
    issues.add('MISSING_FII_ELIGIBILITY_METADATA');
  } else {
    const allKnown = fiiFacts.every((f) => f.status === 'KNOWN');
    const stale =
      input.asOfDate !== undefined &&
      input.fiiStalenessDays !== undefined &&
      fiiFacts.some((f) => daysBetween(f.asOfDate, input.asOfDate!) > input.fiiStalenessDays!);
    for (const f of fiiFacts) {
      if (f.provenance.sourceReference) provenanceReferences.push(f.provenance.sourceReference);
    }
    if (stale) issues.add('STALE_FII_ELIGIBILITY_METADATA');
    if (!allKnown) issues.add('MISSING_FII_ELIGIBILITY_METADATA');
    fiiMetadataStatus = allKnown && !stale ? 'COMPLETE' : 'PARTIAL';
  }

  const issueList = [...issues].sort();

  return Object.freeze({
    competence: input.competence,
    tradeClassificationStatus,
    withholdingStatus,
    fiiMetadataStatus,
    issues: Object.freeze(issueList),
    capabilities: {
      tradeClassificationComplete:
        tradeClassificationStatus === 'COMPLETE' || tradeClassificationStatus === 'NOT_REQUIRED',
      withholdingComplete: withholdingStatus === 'COMPLETE' || withholdingStatus === 'NOT_REQUIRED',
      fiiMetadataComplete: fiiMetadataStatus === 'COMPLETE' || fiiMetadataStatus === 'NOT_REQUIRED',
    },
    classificationCoverage: { required: required.length, classified, unknown },
    provenanceReferences: Object.freeze([...new Set(provenanceReferences)].sort()),
  });
}

function daysBetween(from: LocalDate, to: LocalDate): number {
  const ms = Date.parse(`${to.toString()}T00:00:00Z`) - Date.parse(`${from.toString()}T00:00:00Z`);
  return Math.floor(ms / 86_400_000);
}

/** Convenience: is a competence at or after another (lexicographic civil order). */
export function isCompetenceAtOrAfter(a: FiscalCompetence, b: FiscalCompetence): boolean {
  return compareFiscalCompetence(a, b) >= 0;
}
