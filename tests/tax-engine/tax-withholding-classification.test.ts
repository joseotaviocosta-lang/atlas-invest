import { describe, expect, it } from 'vitest';
import {
  validateTaxWithholdingInput,
  isTaxWithholdingCategory,
  requiresWithholdingCategory,
  TAX_WITHHOLDING_CATEGORIES,
  type TaxWithholdingInput,
} from '@atlas/tax-engine';
import { fingerprintWithholding } from '../../apps/api/src/application/fiscal/tax-input-fingerprint';

function input(overrides: Partial<TaxWithholdingInput> = {}): TaxWithholdingInput {
  return {
    id: 'wh-1',
    sourceReference: 'broker-note-1',
    sourceType: 'MANUAL',
    economicDate: '2026-08-15' as never,
    competence: '2026-08' as never,
    category: 'BRAZILIAN_EQUITY',
    currency: 'BRL',
    amount: { amount: '3', currency: 'BRL', isNegative: () => false } as never,
    status: 'CONFIRMED',
    provenance: { source: 'MANUAL', sourceReference: 'broker-note-1' },
    ...overrides,
  };
}

describe('Phase 4G.2B.0 — canonical equity withholding classification (domain)', () => {
  it('exposes exactly EQUITY_NORMAL and EQUITY_DAY_TRADE', () => {
    expect([...TAX_WITHHOLDING_CATEGORIES]).toEqual(['EQUITY_NORMAL', 'EQUITY_DAY_TRADE']);
    expect(isTaxWithholdingCategory('EQUITY_NORMAL')).toBe(true);
    expect(isTaxWithholdingCategory('EQUITY_DAY_TRADE')).toBe(true);
    expect(isTaxWithholdingCategory('SOMETHING_ELSE')).toBe(false);
    expect(isTaxWithholdingCategory(undefined)).toBe(false);
  });

  it('requires the discriminator only for BRAZILIAN_EQUITY', () => {
    expect(requiresWithholdingCategory('BRAZILIAN_EQUITY')).toBe(true);
    expect(requiresWithholdingCategory('FII')).toBe(false);
  });

  it('A. accepts BRAZILIAN_EQUITY + EQUITY_NORMAL', () => {
    const r = validateTaxWithholdingInput(input({ withholdingCategory: 'EQUITY_NORMAL' }));
    expect(r.valid).toBe(true);
  });

  it('B. accepts BRAZILIAN_EQUITY + EQUITY_DAY_TRADE', () => {
    const r = validateTaxWithholdingInput(input({ withholdingCategory: 'EQUITY_DAY_TRADE' }));
    expect(r.valid).toBe(true);
  });

  it('C. rejects BRAZILIAN_EQUITY without a discriminator', () => {
    const r = validateTaxWithholdingInput(input());
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('withholdingCategory is required');
  });

  it('D. rejects an invalid discriminator', () => {
    const r = validateTaxWithholdingInput(
      input({ withholdingCategory: 'SOMETHING_ELSE' as never }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('Unknown withholdingCategory');
  });

  it('E. legacy null discriminator is not silently classified', () => {
    const legacy = input();
    expect(legacy.withholdingCategory).toBeUndefined();
    const r = validateTaxWithholdingInput(legacy);
    expect(r.valid).toBe(false);
  });

  it('F. FII behavior unchanged (no equity discriminator required)', () => {
    const r = validateTaxWithholdingInput(input({ category: 'FII' }));
    expect(r.valid).toBe(true);
  });

  it('rejects an equity discriminator on a non-equity category', () => {
    const r = validateTaxWithholdingInput(
      input({ category: 'FII', withholdingCategory: 'EQUITY_NORMAL' }),
    );
    expect(r.valid).toBe(false);
  });

  it('G. fingerprint distinguishes EQUITY_NORMAL from EQUITY_DAY_TRADE', () => {
    const base = {
      competence: '2026-08',
      category: 'BRAZILIAN_EQUITY',
      amount: '3',
      currency: 'BRL',
      status: 'CONFIRMED',
      sourceType: 'MANUAL',
      sourceReference: 'broker-note-1',
    };
    const normal = fingerprintWithholding({ ...base, withholdingCategory: 'EQUITY_NORMAL' });
    const dayTrade = fingerprintWithholding({ ...base, withholdingCategory: 'EQUITY_DAY_TRADE' });
    const same = fingerprintWithholding({ ...base, withholdingCategory: 'EQUITY_NORMAL' });
    expect(normal).not.toBe(dayTrade);
    expect(normal).toBe(same);
    expect(normal).toMatch(/^[0-9a-f]{64}$/);
  });

  it('H. legacy fingerprint (no discriminator) is preserved', () => {
    const base = {
      competence: '2026-08',
      category: 'FII',
      amount: '3',
      currency: 'BRL',
      status: 'CONFIRMED',
      sourceType: 'MANUAL',
      sourceReference: 'fii-note-1',
    };
    const legacy = fingerprintWithholding(base);
    const withNull = fingerprintWithholding({ ...base, withholdingCategory: null });
    expect(legacy).toBe(withNull);
  });
});
