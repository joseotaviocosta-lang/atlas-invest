import { describe, expect, it } from 'vitest';
import { LocalDate } from '@atlas/domain';
import { resolveTaxRuleSetForCategory, type TaxRuleSet } from '@atlas/tax-engine';
import { rule, verifiedRule } from './liability-helpers';

describe('Phase 4B — category-aware effective rule resolution', () => {
  it('resolves a category-specific rule', () => {
    const res = resolveTaxRuleSetForCategory(
      [verifiedRule('FII', { ratePercentage: '20' })],
      'BR',
      'FII',
      LocalDate.from('2026-09-30'),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ruleSet.taxCategory).toBe('FII');
  });

  it('lets a category-agnostic rule apply to any category', () => {
    const agnostic = rule({ id: 'BR-AGNOSTIC', version: 'a1', status: 'VERIFIED' });
    const res = resolveTaxRuleSetForCategory(
      [agnostic],
      'BR',
      'BRAZILIAN_EQUITY',
      LocalDate.from('2026-09-30'),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ruleSet.id).toBe('BR-AGNOSTIC');
  });

  it('fails closed when no rule covers the category/date', () => {
    const res = resolveTaxRuleSetForCategory(
      [],
      'BR',
      'BRAZILIAN_EQUITY',
      LocalDate.from('2026-09-30'),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('MISSING_RULE_SET');
  });

  it('fails closed on overlapping category rules', () => {
    const a = verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '10' }, { id: 'A' });
    const b = verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '20' }, { id: 'B' });
    const res = resolveTaxRuleSetForCategory(
      [a, b],
      'BR',
      'BRAZILIAN_EQUITY',
      LocalDate.from('2026-09-30'),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('AMBIGUOUS_RULE_SET');
  });

  it('honours effective dates at the day boundary', () => {
    const v1 = verifiedRule(
      'BRAZILIAN_EQUITY',
      { ratePercentage: '10' },
      {
        id: 'V1',
        version: 'v1',
        effectiveFrom: LocalDate.from('2026-01-01'),
        effectiveTo: LocalDate.from('2026-06-30'),
      },
    );
    const v2 = verifiedRule(
      'BRAZILIAN_EQUITY',
      { ratePercentage: '20' },
      {
        id: 'V2',
        version: 'v2',
        effectiveFrom: LocalDate.from('2026-07-01'),
      },
    );
    const ruleSets: TaxRuleSet[] = [v1, v2];

    const before = resolveTaxRuleSetForCategory(
      ruleSets,
      'BR',
      'BRAZILIAN_EQUITY',
      LocalDate.from('2026-06-30'),
    );
    expect(before.ok && before.ruleSet.version).toBe('v1');
    const onEffective = resolveTaxRuleSetForCategory(
      ruleSets,
      'BR',
      'BRAZILIAN_EQUITY',
      LocalDate.from('2026-07-01'),
    );
    expect(onEffective.ok && onEffective.ruleSet.version).toBe('v2');
    const after = resolveTaxRuleSetForCategory(
      ruleSets,
      'BR',
      'BRAZILIAN_EQUITY',
      LocalDate.from('2026-07-02'),
    );
    expect(after.ok && after.ruleSet.version).toBe('v2');
  });

  it('keeps a historical month reproducible after a new rule version exists', () => {
    const v1 = verifiedRule(
      'BRAZILIAN_EQUITY',
      { ratePercentage: '10' },
      {
        id: 'V1',
        version: 'v1',
        effectiveFrom: LocalDate.from('2026-01-01'),
        effectiveTo: LocalDate.from('2026-06-30'),
      },
    );
    const v2 = verifiedRule(
      'BRAZILIAN_EQUITY',
      { ratePercentage: '20' },
      {
        id: 'V2',
        version: 'v2',
        effectiveFrom: LocalDate.from('2026-07-01'),
      },
    );
    // Historical June month still resolves V1 even though V2 now exists.
    const june = resolveTaxRuleSetForCategory(
      [v1, v2],
      'BR',
      'BRAZILIAN_EQUITY',
      LocalDate.from('2026-06-15'),
    );
    expect(june.ok && june.ruleSet.version).toBe('v1');
  });
});
