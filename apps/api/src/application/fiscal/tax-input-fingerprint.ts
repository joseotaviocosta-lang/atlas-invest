import { createHash } from 'node:crypto';

/**
 * Deterministic fingerprints for canonical tax-input idempotency (Phase 4B.3).
 * Same logical input => same fingerprint. No financial float serialization:
 * amounts/percentages are passed as exact decimal strings.
 */
function digest(parts: readonly (string | null | undefined | number | boolean)[]): string {
  return createHash('sha256')
    .update(parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('|'), 'utf8')
    .digest('hex');
}

export function fingerprintTradeClassification(input: {
  transactionId: string;
  classification: string;
  sourceType: string;
  sourceReference: string;
  effectiveDate: string;
}): string {
  return digest([
    input.transactionId,
    input.classification,
    input.sourceType,
    input.sourceReference,
    input.effectiveDate,
  ]);
}

export function fingerprintWithholding(input: {
  competence: string;
  category: string;
  withholdingCategory?: string | null;
  amount: string | null;
  currency: string;
  status: string;
  sourceType: string;
  sourceReference: string;
}): string {
  const parts: (string | null)[] = [
    input.competence,
    input.category,
    input.amount,
    input.currency,
    input.status,
    input.sourceType,
    input.sourceReference,
  ];
  // Phase 4G.2B.0 — versioned extension: the explicit withholding discriminator is
  // part of semantic identity only when present, so legacy fingerprints (no
  // discriminator) are preserved byte-for-byte.
  if (input.withholdingCategory) parts.push(`wc:${input.withholdingCategory}`);
  return digest(parts);
}

export function fingerprintFiiEligibility(input: {
  assetId: string;
  asOfDate: string;
  holderCount: number | null;
  investorOwnershipPercent: string | null;
  isExchangeTraded: boolean | null;
  status: string;
  sourceType: string;
  sourceReference: string;
}): string {
  return digest([
    input.assetId,
    input.asOfDate,
    input.holderCount,
    input.investorOwnershipPercent,
    input.isExchangeTraded,
    input.status,
    input.sourceType,
    input.sourceReference,
  ]);
}
