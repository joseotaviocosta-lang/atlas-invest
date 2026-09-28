import { describe, it, expect } from 'vitest';
import {
  resolveTaxAssetCategory,
  isTaxCategorySupportedInPhase4A,
  PHASE_4A_SUPPORTED_TAX_CATEGORIES,
  type TaxAssetCategory,
} from '@atlas/tax-engine';

describe('Phase 4A — deterministic asset tax classification', () => {
  it.each<[string, TaxAssetCategory]>([
    ['STOCK', 'BRAZILIAN_EQUITY'],
    ['FII', 'FII'],
    ['ETF', 'ETF'],
    ['BDR', 'BDR'],
    ['FIXED_INCOME', 'FIXED_INCOME'],
    ['TREASURY', 'FIXED_INCOME'],
  ])('maps AssetType %s -> %s', (assetType, expected) => {
    expect(resolveTaxAssetCategory(assetType)).toBe(expected);
  });

  it('never silently assigns Brazilian equity to unknown inputs (fail closed)', () => {
    expect(resolveTaxAssetCategory('FUND')).toBe('UNKNOWN');
    expect(resolveTaxAssetCategory('CASH')).toBe('UNKNOWN');
    expect(resolveTaxAssetCategory('CRYPTO')).toBe('UNKNOWN');
    expect(resolveTaxAssetCategory(undefined)).toBe('UNKNOWN');
    expect(resolveTaxAssetCategory(null)).toBe('UNKNOWN');
    expect(resolveTaxAssetCategory('')).toBe('UNKNOWN');
  });

  it('is case/whitespace tolerant but never infers beyond the mapping', () => {
    expect(resolveTaxAssetCategory(' stock ')).toBe('BRAZILIAN_EQUITY');
  });

  it('marks only equity and FII as supported in Phase 4A', () => {
    expect(PHASE_4A_SUPPORTED_TAX_CATEGORIES).toEqual(['BRAZILIAN_EQUITY', 'FII']);
    expect(isTaxCategorySupportedInPhase4A('BRAZILIAN_EQUITY')).toBe(true);
    expect(isTaxCategorySupportedInPhase4A('FII')).toBe(true);
    expect(isTaxCategorySupportedInPhase4A('ETF')).toBe(false);
    expect(isTaxCategorySupportedInPhase4A('BDR')).toBe(false);
    expect(isTaxCategorySupportedInPhase4A('FIXED_INCOME')).toBe(false);
    expect(isTaxCategorySupportedInPhase4A('UNKNOWN')).toBe(false);
  });
});
