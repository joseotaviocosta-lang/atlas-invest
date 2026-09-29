import { daysInMonth } from './competence';
import type { TaxObligationBucket } from './revenue-codes';

/**
 * Phase 4C.2 — Federal Tax Deadline Registry (direct official authority).
 *
 * Maps an official federal tax obligation key (revenue code + competence) to an
 * already-resolved payment due date published by the RFB Agenda Tributária /
 * ADE CORAT. This is the PRIMARY 4C deadline authority — no generic business
 * calendar is reconstructed (ADR-262, ADR-268).
 *
 * Entries are immutable/versioned official facts: a Receita correction creates a
 * new version and marks the previous one `SUPERSEDED` (ADR-263). Only `VERIFIED`
 * entries may produce a payable obligation; a missing entry fails closed.
 */
export const FEDERAL_TAX_DEADLINE_STATUSES = ['VERIFIED', 'SUPERSEDED', 'REVOKED'] as const;
export type FederalTaxDeadlineStatus = (typeof FEDERAL_TAX_DEADLINE_STATUSES)[number];

export interface FederalTaxDeadlineEntry {
  readonly id: string;
  readonly revenueCode: string;
  readonly taxBucket: TaxObligationBucket | string;
  /** Civil competence in canonical `YYYY-MM`. */
  readonly competence: string;
  /** Official resolved due date in canonical civil `YYYY-MM-DD`. */
  readonly dueDate: string;
  readonly status: FederalTaxDeadlineStatus;
  readonly sourceAuthority: string;
  readonly sourceDocument: string;
  readonly sourceReference: string;
  /** Publication date of the official act (`YYYY-MM-DD`). */
  readonly sourcePublishedAt: string;
  /** Date the entry was verified against the official source (`YYYY-MM-DD`). */
  readonly verifiedAt: string;
  readonly version: number;
  readonly supersedesEntryId: string | null;
  readonly metadata?: Readonly<Record<string, string>>;
}

export const FEDERAL_TAX_DEADLINE_RESOLUTION_OUTCOMES = [
  'RESOLVED',
  'MISSING_OFFICIAL_DEADLINE',
  'AMBIGUOUS_OFFICIAL_DEADLINE',
] as const;
export type FederalTaxDeadlineResolutionOutcome =
  (typeof FEDERAL_TAX_DEADLINE_RESOLUTION_OUTCOMES)[number];

export interface FederalTaxDeadlineResolution {
  readonly outcome: FederalTaxDeadlineResolutionOutcome;
  readonly entry: FederalTaxDeadlineEntry | null;
  readonly reasonCode: string | null;
}

const COMPETENCE_REGEX = /^(\d{4})-(\d{2})$/;
const CIVIL_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict civil-date validation (rejects `2026-02-30`, `2026-13-01`, ...). */
export function isCanonicalCivilDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = CIVIL_DATE_REGEX.exec(value);
  if (!match) return false;
  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  const day = parseInt(match[3]!, 10);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

export function isCanonicalCompetence(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = COMPETENCE_REGEX.exec(value);
  if (!match) return false;
  const month = parseInt(match[2]!, 10);
  return month >= 1 && month <= 12;
}

/** Structural validation of a deadline entry (pure, no I/O). */
export function validateFederalTaxDeadlineEntry(entry: FederalTaxDeadlineEntry): string[] {
  const issues: string[] = [];
  if (!entry.id) issues.push('MISSING_ID');
  if (!entry.revenueCode) issues.push('MISSING_REVENUE_CODE');
  if (!entry.taxBucket) issues.push('MISSING_TAX_BUCKET');
  if (!isCanonicalCompetence(entry.competence)) issues.push('INVALID_COMPETENCE');
  if (!isCanonicalCivilDate(entry.dueDate)) issues.push('INVALID_DUE_DATE');
  if (!FEDERAL_TAX_DEADLINE_STATUSES.includes(entry.status)) issues.push('INVALID_STATUS');
  if (!entry.sourceAuthority) issues.push('MISSING_SOURCE_AUTHORITY');
  if (!entry.sourceDocument) issues.push('MISSING_SOURCE_DOCUMENT');
  if (!entry.sourceReference) issues.push('MISSING_SOURCE_REFERENCE');
  if (!isCanonicalCivilDate(entry.sourcePublishedAt)) issues.push('INVALID_SOURCE_PUBLISHED_AT');
  if (!isCanonicalCivilDate(entry.verifiedAt)) issues.push('INVALID_VERIFIED_AT');
  if (!Number.isInteger(entry.version) || entry.version < 1) issues.push('INVALID_VERSION');
  return issues;
}

/**
 * Returns the active `VERIFIED` entry for a logical identity (revenue code +
 * competence). Used to detect duplicate active versions (invalid configuration).
 */
export function activeVerifiedDeadlineEntries(
  entries: readonly FederalTaxDeadlineEntry[],
  revenueCode: string,
  competence: string,
): FederalTaxDeadlineEntry[] {
  return entries.filter(
    (entry) =>
      entry.revenueCode === revenueCode &&
      entry.competence === competence &&
      entry.status === 'VERIFIED',
  );
}

/**
 * Deterministically resolves the official due date for a revenue code +
 * competence. Fails closed: `SUPERSEDED`/`REVOKED` entries are ignored, zero
 * `VERIFIED` entries → `MISSING_OFFICIAL_DEADLINE`, and more than one `VERIFIED`
 * entry → `AMBIGUOUS_OFFICIAL_DEADLINE` (invalid registry configuration).
 */
export function resolveFederalTaxDeadline(input: {
  readonly entries: readonly FederalTaxDeadlineEntry[];
  readonly revenueCode: string;
  readonly competence: string;
}): FederalTaxDeadlineResolution {
  const matches = activeVerifiedDeadlineEntries(input.entries, input.revenueCode, input.competence);
  if (matches.length === 0) {
    return {
      outcome: 'MISSING_OFFICIAL_DEADLINE',
      entry: null,
      reasonCode: 'MISSING_OFFICIAL_DEADLINE',
    };
  }
  if (matches.length > 1) {
    return {
      outcome: 'AMBIGUOUS_OFFICIAL_DEADLINE',
      entry: null,
      reasonCode: 'AMBIGUOUS_OFFICIAL_DEADLINE',
    };
  }
  return { outcome: 'RESOLVED', entry: matches[0]!, reasonCode: null };
}
