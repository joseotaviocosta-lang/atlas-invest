import { createHash } from 'node:crypto';
import {
  AccountId,
  AssetId,
  Currency,
  LocalDate,
  Money,
  PortfolioId,
  Quantity,
} from '@atlas/domain';
import { TaxSubjectId } from '../ids';
import { InvalidAnnualOpeningPositionError } from '../errors';

/**
 * Provenance source for a pre-Atlas opening position entry.
 */
export type OpeningPositionSource =
  'MANUAL_CONFIRMED' | 'IMPORT_STATEMENT' | 'PRIOR_YEAR_DECLARATION';

export const OPENING_POSITION_SOURCES: readonly OpeningPositionSource[] = [
  'MANUAL_CONFIRMED',
  'IMPORT_STATEMENT',
  'PRIOR_YEAR_DECLARATION',
] as const;

/**
 * Lifecycle status of an opening position entry.
 */
export type OpeningPositionStatus = 'DRAFT' | 'CONFIRMED' | 'SUPERSEDED';

export const OPENING_POSITION_STATUSES: readonly OpeningPositionStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'SUPERSEDED',
] as const;

/**
 * Canonical domain model for a pre-Atlas opening position input.
 * Represents initial holding custody and acquisition cost established
 * before the transaction ledger history begins.
 */
export interface AnnualOpeningPositionInput {
  readonly id: string;
  readonly taxSubjectId: TaxSubjectId;
  readonly portfolioId: PortfolioId;
  readonly accountId: AccountId;
  readonly assetId: AssetId;
  readonly effectiveDate: LocalDate;
  readonly quantity: Quantity;
  readonly totalHistoricalCost: Money;
  readonly currency: Currency;
  readonly source: OpeningPositionSource;
  readonly status: OpeningPositionStatus;
  readonly revision: number;
  readonly fingerprint: string;
  readonly notes?: string;
  readonly supersedesId?: string;
  readonly confirmedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OpeningPositionFingerprintInput {
  readonly taxSubjectId: string;
  readonly portfolioId: string;
  readonly accountId: string;
  readonly assetId: string;
  readonly effectiveDate: string;
  readonly quantity: string;
  readonly totalHistoricalCost: string;
  readonly currency: string;
  readonly source: string;
  readonly revision: number;
}

/**
 * Computes a deterministic SHA-256 semantic fingerprint for an opening position revision.
 */
export function computeOpeningPositionFingerprint(input: OpeningPositionFingerprintInput): string {
  return createHash('sha256')
    .update(
      [
        input.taxSubjectId,
        input.portfolioId,
        input.accountId,
        input.assetId,
        input.effectiveDate,
        input.quantity,
        input.totalHistoricalCost,
        input.currency,
        input.source,
        String(input.revision),
      ].join('|'),
      'utf8',
    )
    .digest('hex');
}

export interface CreateOpeningPositionDomainInput {
  readonly id: string;
  readonly taxSubjectId: TaxSubjectId;
  readonly portfolioId: PortfolioId;
  readonly accountId: AccountId;
  readonly assetId: AssetId;
  readonly effectiveDate: LocalDate;
  readonly quantity: Quantity;
  readonly totalHistoricalCost: Money;
  readonly currency?: Currency;
  readonly source: OpeningPositionSource;
  readonly status?: OpeningPositionStatus;
  readonly revision?: number;
  readonly notes?: string;
  readonly supersedesId?: string;
  readonly confirmedAt?: Date;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Creates and validates an immutable AnnualOpeningPositionInput instance.
 */
export function createAnnualOpeningPosition(
  input: CreateOpeningPositionDomainInput,
): AnnualOpeningPositionInput {
  if (!input.id || typeof input.id !== 'string') {
    throw new InvalidAnnualOpeningPositionError('Opening position id is required.');
  }
  if (!input.taxSubjectId) {
    throw new InvalidAnnualOpeningPositionError('TaxSubjectId is required.');
  }
  if (!input.portfolioId) {
    throw new InvalidAnnualOpeningPositionError('PortfolioId is required.');
  }
  if (!input.accountId) {
    throw new InvalidAnnualOpeningPositionError('AccountId is required.');
  }
  if (!input.assetId) {
    throw new InvalidAnnualOpeningPositionError('AssetId is required.');
  }
  if (!input.effectiveDate) {
    throw new InvalidAnnualOpeningPositionError('Effective date is required.');
  }
  if (!input.quantity || input.quantity.isZero() || input.quantity.isNegative()) {
    throw new InvalidAnnualOpeningPositionError(
      'Opening position quantity must be strictly positive (> 0).',
    );
  }
  if (!input.totalHistoricalCost || input.totalHistoricalCost.isNegative()) {
    throw new InvalidAnnualOpeningPositionError(
      'Opening position totalHistoricalCost must be non-negative (>= 0).',
    );
  }

  const currency = input.currency ?? (input.totalHistoricalCost.currency as Currency);
  if (currency !== input.totalHistoricalCost.currency) {
    throw new InvalidAnnualOpeningPositionError(
      `Currency mismatch: specified currency '${currency}' does not match totalHistoricalCost currency '${input.totalHistoricalCost.currency}'.`,
    );
  }

  if (!OPENING_POSITION_SOURCES.includes(input.source)) {
    throw new InvalidAnnualOpeningPositionError(`Invalid opening position source: ${input.source}`);
  }

  const status = input.status ?? 'CONFIRMED';
  if (!OPENING_POSITION_STATUSES.includes(status)) {
    throw new InvalidAnnualOpeningPositionError(`Invalid opening position status: ${status}`);
  }

  const revision = input.revision ?? 1;
  if (!Number.isInteger(revision) || revision < 1) {
    throw new InvalidAnnualOpeningPositionError(
      `Invalid opening position revision: ${revision}. Must be a positive integer.`,
    );
  }

  const fingerprint = computeOpeningPositionFingerprint({
    taxSubjectId: String(input.taxSubjectId),
    portfolioId: String(input.portfolioId),
    accountId: String(input.accountId),
    assetId: String(input.assetId),
    effectiveDate: input.effectiveDate.toString(),
    quantity: input.quantity.toString(),
    totalHistoricalCost: input.totalHistoricalCost.amount.toString(),
    currency: String(currency),
    source: input.source,
    revision,
  });

  const now = new Date();

  return Object.freeze({
    id: input.id,
    taxSubjectId: input.taxSubjectId,
    portfolioId: input.portfolioId,
    accountId: input.accountId,
    assetId: input.assetId,
    effectiveDate: input.effectiveDate,
    quantity: input.quantity,
    totalHistoricalCost: input.totalHistoricalCost,
    currency,
    source: input.source,
    status,
    revision,
    fingerprint,
    notes: input.notes,
    supersedesId: input.supersedesId,
    confirmedAt: status === 'CONFIRMED' ? (input.confirmedAt ?? now) : undefined,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  });
}
