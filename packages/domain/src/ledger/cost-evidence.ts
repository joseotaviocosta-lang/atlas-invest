/**
 * Historical cost-basis evidence (ADR-310).
 *
 * A cost-evidence record is an audited claim that an already-represented
 * quantity carries a factual acquisition cost. It is NEVER a ledger event:
 * it cannot create, move, or rewrite quantities, and it is never replayed.
 * All financial math uses exact decimal strings (Money / Quantity); the
 * `number` type appears only for the monotonic revision counter.
 */
import { Money } from '../primitives/money';
import { Quantity } from '../primitives/quantity';
import { DecimalValue } from '../primitives/decimal-value';
import { sha256Hex } from '../primitives/sha256';
import { LocalDate } from '../primitives/local-date';
import { Currency, assertValidCurrency } from '../primitives/currency';
import { assertValidUUID } from '../primitives/domain-id';
import {
  InvalidCostEvidenceError,
  InvalidMoneyError,
  InvalidQuantityError,
  InvalidLocalDateError,
} from '../errors/domain-error';

export const COST_EVIDENCE_TYPES = [
  'BROKERAGE_NOTE',
  'BROKER_STATEMENT',
  'ANNUAL_TAX_STATEMENT',
  'OFFICIAL_POSITION_REPORT',
  'MANUAL_DOCUMENTED',
] as const;
export type CostEvidenceType = (typeof COST_EVIDENCE_TYPES)[number];

export const COST_EVIDENCE_STATUSES = [
  'DRAFT',
  'REVIEW_REQUIRED',
  'VERIFIED',
  'REJECTED',
] as const;
export type CostEvidenceStatus = (typeof COST_EVIDENCE_STATUSES)[number];

/** v1: owner-entered and owner-confirmed evidence only. */
export const COST_EVIDENCE_SOURCES = ['MANUAL_CONFIRMED'] as const;
export type CostEvidenceSource = (typeof COST_EVIDENCE_SOURCES)[number];

export const COST_EVIDENCE_CREATABLE_STATUSES = ['DRAFT', 'REVIEW_REQUIRED'] as const;

export interface CostEvidenceInput {
  portfolioId: string;
  accountId: string;
  assetId: string;
  evidenceType: string;
  sourceType: string;
  quantityCovered: string;
  unitCost?: string;
  totalCost?: string;
  currency: string;
  acquisitionDate: string;
  evidenceDate?: string;
  sourceReference: string;
  notes?: string;
}

/**
 * Validated, frozen cost-evidence record (before persistence identity).
 */
export interface CostBasisEvidence {
  readonly portfolioId: string;
  readonly accountId: string;
  readonly assetId: string;
  readonly evidenceType: CostEvidenceType;
  readonly sourceType: CostEvidenceSource;
  readonly quantityCovered: Quantity;
  readonly unitCost?: Money;
  readonly totalCost: Money;
  readonly currency: Currency;
  readonly acquisitionDate: LocalDate;
  readonly evidenceDate?: LocalDate;
  readonly status: CostEvidenceStatus;
  readonly sourceReference: string;
  readonly notes?: string;
}

function fail(message: string): never {
  throw new InvalidCostEvidenceError(message);
}

function parseMoney(
  raw: string | undefined,
  field: string,
  currency: Currency,
): Money | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  try {
    const money = Money.from(trimmed, currency);
    if (money.isNegative()) {
      fail(`${field} must not be negative, received '${trimmed}'`);
    }
    return money;
  } catch (err) {
    if (err instanceof InvalidCostEvidenceError) throw err;
    if (err instanceof InvalidMoneyError) {
      fail(`${field} is not a valid monetary amount: '${trimmed}'`);
    }
    throw err;
  }
}

/**
 * Validates raw evidence input into frozen domain values. At least one of
 * unitCost / totalCost is required; when both are present they must agree
 * exactly (unitCost × quantityCovered === totalCost), otherwise
 * COST_EVIDENCE_AMOUNT_MISMATCH. Never infers or silently reconciles.
 */
export function validateCostEvidenceInput(
  input: CostEvidenceInput,
  options?: { initialStatus?: 'DRAFT' | 'REVIEW_REQUIRED' },
): CostBasisEvidence {
  const portfolioId = assertValidUUID(input.portfolioId, 'PortfolioId');
  const accountId = assertValidUUID(input.accountId, 'AccountId');
  const assetId = assertValidUUID(input.assetId, 'AssetId');

  if (!(COST_EVIDENCE_TYPES as readonly string[]).includes(input.evidenceType)) {
    fail(`Unknown evidence type '${input.evidenceType}'`);
  }
  if (!(COST_EVIDENCE_SOURCES as readonly string[]).includes(input.sourceType)) {
    fail(`Unknown evidence source '${input.sourceType}'`);
  }
  const currency = assertValidCurrency(input.currency);

  let quantity: Quantity;
  try {
    quantity = Quantity.from(input.quantityCovered);
  } catch (err) {
    if (err instanceof InvalidQuantityError) {
      fail(`quantityCovered is not a valid quantity: '${input.quantityCovered}'`);
    }
    throw err;
  }
  if (!quantity.isPositive()) {
    fail(`quantityCovered must be > 0, received '${quantity.value}'`);
  }

  const unitCost = parseMoney(input.unitCost, 'unitCost', currency);
  const totalCost = parseMoney(input.totalCost, 'totalCost', currency);
  if (!unitCost && !totalCost) {
    fail('At least one of unitCost or totalCost is required');
  }
  // Derive the missing side exactly; verify agreement when both are present.
  const resolvedTotal = totalCost ?? unitCost!.multiply(quantity.value);
  const resolvedUnit = unitCost ?? resolvedTotal.divide(quantity.value);
  if (unitCost && totalCost && !unitCost.multiply(quantity.value).equals(totalCost)) {
    fail(
      `COST_EVIDENCE_AMOUNT_MISMATCH: unitCost '${unitCost.amount}' × quantityCovered '${quantity.value}' != totalCost '${totalCost.amount}'`,
    );
  }

  let acquisitionDate: LocalDate;
  try {
    acquisitionDate = LocalDate.from(input.acquisitionDate);
  } catch (err) {
    if (err instanceof InvalidLocalDateError) {
      fail(`acquisitionDate must be an exact civil date (YYYY-MM-DD): '${input.acquisitionDate}'`);
    }
    throw err;
  }
  let evidenceDate: LocalDate | undefined;
  if (input.evidenceDate !== undefined && input.evidenceDate.trim() !== '') {
    try {
      evidenceDate = LocalDate.from(input.evidenceDate);
    } catch (err) {
      if (err instanceof InvalidLocalDateError) {
        fail(`evidenceDate must be an exact civil date (YYYY-MM-DD): '${input.evidenceDate}'`);
      }
      throw err;
    }
  }

  const sourceReference = (input.sourceReference ?? '').trim();
  if (sourceReference.length === 0) {
    fail('sourceReference is required (stable document identifier, never a filesystem path)');
  }
  if (sourceReference.length > 255) {
    fail('sourceReference must be at most 255 characters');
  }
  const notes = input.notes?.trim();
  if (notes !== undefined && notes.length > 1000) {
    fail('notes must be at most 1000 characters');
  }

  const initialStatus = options?.initialStatus ?? 'REVIEW_REQUIRED';
  if (!(COST_EVIDENCE_CREATABLE_STATUSES as readonly string[]).includes(initialStatus)) {
    fail(`Cannot create evidence with status '${initialStatus}'`);
  }

  return Object.freeze({
    portfolioId,
    accountId,
    assetId,
    evidenceType: input.evidenceType as CostEvidenceType,
    sourceType: input.sourceType as CostEvidenceSource,
    quantityCovered: quantity,
    ...(resolvedUnit ? { unitCost: resolvedUnit } : {}),
    totalCost: resolvedTotal,
    currency,
    acquisitionDate,
    ...(evidenceDate ? { evidenceDate } : {}),
    status: initialStatus as CostEvidenceStatus,
    sourceReference,
    ...(notes ? { notes } : {}),
  });
}

/**
 * Semantic fingerprint for duplicate detection (PART K). Excludes identity,
 * version, status, notes and timestamps: the same evidence resubmitted is
 * always the same fingerprint.
 */
export function computeCostEvidenceFingerprint(input: {
  portfolioId: string;
  accountId: string;
  assetId: string;
  evidenceType: string;
  acquisitionDate: string;
  quantityCovered: string;
  unitCost?: string;
  totalCost?: string;
  currency: string;
  sourceReference: string;
  source: string;
}): string {
  return sha256Hex(
    [
      input.portfolioId.trim().toLowerCase(),
      input.accountId.trim().toLowerCase(),
      input.assetId.trim().toLowerCase(),
      input.evidenceType,
      input.acquisitionDate,
      input.quantityCovered,
      input.unitCost ?? '',
      input.totalCost ?? '',
      input.currency,
      input.sourceReference.trim(),
      input.source,
    ].join('|'),
  );
}

/**
 * Lot identity for overlap handling (PART L/M). Two VERIFIED records sharing
 * a lot key describe the SAME historical acquisition lot (e.g. a brokerage
 * note and the annual statement quoting it) and must never be summed.
 * Records with different keys are distinct lots. The key deliberately
 * excludes document identity: same economics from two documents collide.
 */
export function computeCostLotKey(input: {
  assetId: string;
  accountId: string;
  acquisitionDate: string;
  quantityCovered: string;
  unitCost?: string;
  totalCost?: string;
  currency: string;
}): string {
  return sha256Hex(
    [
      input.assetId.trim().toLowerCase(),
      input.accountId.trim().toLowerCase(),
      input.acquisitionDate,
      input.quantityCovered,
      input.unitCost ?? '',
      input.totalCost ?? '',
      input.currency,
    ].join('|'),
  );
}

/**
 * Exact coverage percentage as a 2-decimal string (display-oriented read;
 * monetary math elsewhere stays full-precision). Throws on zero total.
 */
export function coveragePercent(covered: Quantity, total: Quantity): string {
  if (total.isZero()) {
    throw new InvalidCostEvidenceError('Cannot compute coverage of a zero quantity');
  }
  return DecimalValue.from(covered.value)
    .divide(DecimalValue.from(total.value))
    .multiply(DecimalValue.from('100'))
    .toFixed(2);
}
