import type { TaxAssetCategory } from './types';

/**
 * Phase 4C.2 — verified production revenue-code resolution.
 *
 * A revenue code may only be emitted for a bucket with an officially verified
 * mapping. Unknown/unsupported buckets fail closed (never guessed) — ADR-262.
 */
export const TAX_OBLIGATION_BUCKETS = ['FII_SALE'] as const;
export type TaxObligationBucket = (typeof TAX_OBLIGATION_BUCKETS)[number];

/**
 * Verified production revenue codes (RFB Agenda Tributária / ADE CORAT).
 * `FII_SALE` → `6015` ("Ganhos líquidos em operações em bolsa").
 */
export const PRODUCTION_REVENUE_CODE_MAPPINGS: Readonly<Record<TaxObligationBucket, string>> =
  Object.freeze({ FII_SALE: '6015' });

export function isTaxObligationBucket(value: unknown): value is TaxObligationBucket {
  return typeof value === 'string' && (TAX_OBLIGATION_BUCKETS as readonly string[]).includes(value);
}

/** Resolves the official revenue code for a bucket; `null` fails closed. */
export function resolveRevenueCodeForBucket(bucket: string): string | null {
  if (!isTaxObligationBucket(bucket)) return null;
  return PRODUCTION_REVENUE_CODE_MAPPINGS[bucket];
}

/**
 * Maps a 4A/4B tax asset category to its production obligation bucket.
 * Categories without a verified production bucket return `null` (BLOCKED).
 */
export function resolveObligationBucketForCategory(
  category: TaxAssetCategory,
): TaxObligationBucket | null {
  switch (category) {
    case 'FII':
      return 'FII_SALE';
    default:
      return null;
  }
}
