import { createHash } from 'node:crypto';
import type { MonthlyTaxLiability } from '@atlas/tax-engine';

/**
 * Phase 4C.2 — deterministic liability fingerprint (ADR-264).
 *
 * The same canonical liability (subject + competence + rule version + canonical
 * inputs + resulting amounts) yields the same fingerprint; any change yields a
 * different one, which supersedes the previous obligation revision. Exact
 * decimal strings only — never IEEE-754.
 */
export function fingerprintLiability(input: {
  taxSubjectId: string;
  competence: string;
  liability: MonthlyTaxLiability;
}): string {
  const categories = [...input.liability.categories]
    .map((c) =>
      [
        c.category,
        c.currency,
        c.status,
        c.ruleVersion ?? '',
        c.ratePercentage ?? '',
        c.taxableBaseAfterLosses.amount,
        c.withholdingApplied.amount,
        c.taxDue?.amount ?? '',
        c.closingLossBalance.amount,
      ].join(':'),
    )
    .sort();
  const payload = [
    input.taxSubjectId,
    input.competence,
    input.liability.status,
    [...input.liability.ruleVersions].sort().join(','),
    categories.join(';'),
    input.liability.taxDue?.amount ?? '',
    input.liability.taxDue?.currency ?? '',
  ].join('|');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Phase 4E — sha256 hash of a canonical domain fingerprint (carry-forward
 * entry / payment aggregation). The canonical fingerprint is computed purely in
 * `@atlas/tax-engine`; the persisted identity is its sha256 hex digest.
 */
export function hashCanonicalFingerprint(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Deterministic fingerprint for manual payment evidence idempotency. */
export function fingerprintPaymentEvidence(input: {
  obligationId: string;
  paidAt: string;
  amount: string;
  currency: string;
  sourceType: string;
  sourceReference: string | null;
}): string {
  return createHash('sha256')
    .update(
      [
        input.obligationId,
        input.paidAt,
        input.amount,
        input.currency,
        input.sourceType,
        input.sourceReference ?? '',
      ].join('|'),
      'utf8',
    )
    .digest('hex');
}
