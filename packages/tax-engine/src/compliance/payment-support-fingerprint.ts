/**
 * @atlas/tax-engine — Phase 4K.2B Evidence Idempotency & Semantic Fingerprint.
 *
 * Deterministic semantic fingerprint computation for user-reported tax payment evidence.
 * Pure, deterministic, zero-I/O domain function.
 */

import { computeComplianceFingerprint } from './compliance-fingerprint';

export interface TaxSettlementEvidenceFingerprintInput {
  readonly taxSubjectId: string;
  readonly obligationKey: string;
  readonly sourceFingerprint: string;
  readonly paymentDate: string;
  readonly amountReported: string;
  readonly revenueCodeReported?: string | null;
  readonly referencePeriod: string;
  readonly externalReference?: string | null;
  readonly note?: string | null;
  readonly verificationStatus?: string;
}

/**
 * Normalizes decimal strings so numerically identical amounts share the same representation
 * without IEEE 754 floating-point conversion (e.g., "1000.00" -> "1000", "1000.50" -> "1000.5").
 */
export function normalizeDecimalString(val: string): string {
  const trimmed = val.trim();
  if (!trimmed.includes('.')) {
    const withoutLeading = trimmed.replace(/^0+(?=\d)/, '');
    return withoutLeading === '' ? '0' : withoutLeading;
  }
  const [intPart, fracPart] = trimmed.split('.');
  const cleanInt = (intPart ?? '0').replace(/^0+(?=\d)/, '') || '0';
  const cleanFrac = (fracPart ?? '').replace(/0+$/, '');
  return cleanFrac ? `${cleanInt}.${cleanFrac}` : cleanInt;
}

/**
 * Computes an order-stable, canonical SHA-256 evidence fingerprint.
 * Excludes non-semantic fields (id, revision, createdAt).
 */
export function computeTaxSettlementEvidenceFingerprint(
  input: TaxSettlementEvidenceFingerprintInput,
): string {
  const canonicalPayload = {
    amountReported: normalizeDecimalString(input.amountReported),
    externalReference:
      input.externalReference !== undefined && input.externalReference !== null
        ? input.externalReference.trim()
        : null,
    note: input.note !== undefined && input.note !== null ? input.note.trim() : null,
    obligationKey: input.obligationKey.trim(),
    paymentDate: input.paymentDate.trim(),
    referencePeriod: input.referencePeriod.trim(),
    revenueCodeReported:
      input.revenueCodeReported !== undefined && input.revenueCodeReported !== null
        ? input.revenueCodeReported.trim()
        : null,
    sourceFingerprint: input.sourceFingerprint.trim(),
    taxSubjectId: input.taxSubjectId.trim().toLowerCase(),
    verificationStatus: (input.verificationStatus ?? 'USER_REPORTED').trim(),
  };

  return computeComplianceFingerprint(canonicalPayload);
}
