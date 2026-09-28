import type { AssetType } from '@atlas/domain';
import type { TaxAssetCategory } from './types';

/**
 * Deterministic mapping: canonical AssetType -> TaxAssetCategory (ADR-238 / 4A §28).
 * Never inferred from ticker patterns. Unknown inputs resolve to `UNKNOWN`,
 * never silently to Brazilian equity.
 */
const ASSET_TYPE_TO_TAX_CATEGORY: Readonly<Record<string, TaxAssetCategory>> = Object.freeze({
  STOCK: 'BRAZILIAN_EQUITY',
  FII: 'FII',
  ETF: 'ETF',
  BDR: 'BDR',
  FIXED_INCOME: 'FIXED_INCOME',
  TREASURY: 'FIXED_INCOME',
});

export function resolveTaxAssetCategory(
  assetType: AssetType | string | null | undefined,
): TaxAssetCategory {
  if (typeof assetType !== 'string') return 'UNKNOWN';
  return ASSET_TYPE_TO_TAX_CATEGORY[assetType.trim().toUpperCase()] ?? 'UNKNOWN';
}

/**
 * Tax categories with complete fiscal inputs in Phase 4A.
 * Everything else is deliberately conservative: no production tax conclusion
 * may be derived for categories outside this set.
 */
export const PHASE_4A_SUPPORTED_TAX_CATEGORIES: readonly TaxAssetCategory[] = Object.freeze([
  'BRAZILIAN_EQUITY',
  'FII',
]);

export function isTaxCategorySupportedInPhase4A(category: TaxAssetCategory): boolean {
  return PHASE_4A_SUPPORTED_TAX_CATEGORIES.includes(category);
}
