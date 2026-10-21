/**
 * Phase 5K — deterministic import fingerprints.
 *
 * Two layers (ADR-style, no silent cross-source merges):
 * - source identity: `PROVIDER|EXTERNAL_ID` (exact, backed by the DB unique
 *   constraint on (portfolioId, provider, externalId));
 * - canonical fingerprint: SHA-256 over decimal-normalized canonical fields,
 *   stable regardless of display formatting (never float-derived).
 */

import { createHash } from 'node:crypto';

export interface CanonicalFingerprintInput {
  portfolioId: string;
  accountId: string;
  assetId: string;
  type: string;
  tradeDate: string;
  quantity: string;
  unitPrice: string | null;
  fees: string | null;
  currency: string;
}

/**
 * Canonical decimal form for comparison and hashing: strips insignificant
 * zeros and signs so `38.50`, `38.5` and `038.500` always match.
 * Pure string ops — never float.
 */
export function normalizeDecimalValue(value: string | null): string {
  // Absent amounts (NULL fees in the ledger, empty cells) mean zero.
  if (value === null || value.trim() === '') return '0';
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [integer = '', fraction = ''] = unsigned.split('.');
  const normalizedInteger = integer.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFraction = fraction.replace(/0+$/, '');
  const canonical =
    normalizedFraction === '' ? normalizedInteger : `${normalizedInteger}.${normalizedFraction}`;
  if (canonical === '0') return '0';
  return negative ? `-${canonical}` : canonical;
}

function canonicalDecimal(value: string | null): string {
  return normalizeDecimalValue(value);
}

export function normalizeProvider(provider: string): string {
  return provider.trim().toUpperCase();
}

export function sourceIdentityKey(provider: string, externalId: string): string {
  return `${normalizeProvider(provider)}|${externalId.trim()}`;
}

export function canonicalFingerprint(input: CanonicalFingerprintInput): string {
  const canonical = [
    input.portfolioId,
    input.accountId,
    input.assetId,
    input.type,
    input.tradeDate,
    canonicalDecimal(input.quantity),
    canonicalDecimal(input.unitPrice),
    canonicalDecimal(input.fees),
    input.currency,
  ].join('|');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Price-insensitive variant used for PROBABLE duplicate detection:
 * same economic event, possibly different execution price/fees.
 */
export function probableMatchKey(
  input: Omit<CanonicalFingerprintInput, 'unitPrice' | 'fees'>,
): string {
  const canonical = [
    input.portfolioId,
    input.accountId,
    input.assetId,
    input.type,
    input.tradeDate,
    canonicalDecimal(input.quantity),
    input.currency,
  ].join('|');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
