import { describe, it, expect } from 'vitest';
import { LocalDate } from '@atlas/domain';
import { resolveTaxRuleSet, validateTaxRuleSetRegistry, type TaxRuleSet } from '@atlas/tax-engine';

function rule(over: Partial<TaxRuleSet> & { id: string }): TaxRuleSet {
  return {
    jurisdiction: 'BR',
    version: '1',
    effectiveFrom: LocalDate.from('2026-01-01'),
    status: 'TEST_ONLY',
    ...over,
  } as TaxRuleSet;
}

const V1 = rule({
  id: 'BR-V1',
  version: '1',
  effectiveFrom: LocalDate.from('2026-01-01'),
  effectiveTo: LocalDate.from('2026-06-30'),
});
const V2 = rule({
  id: 'BR-V2',
  version: '2',
  effectiveFrom: LocalDate.from('2026-07-01'),
});

describe('Phase 4A — TaxRuleSet resolution (effective-dated)', () => {
  it('validates a non-overlapping registry', () => {
    const result = validateTaxRuleSetRegistry([V1, V2]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects overlapping effective periods for the same jurisdiction', () => {
    const overlapping = rule({
      id: 'BR-X',
      effectiveFrom: LocalDate.from('2026-05-01'),
    });
    const result = validateTaxRuleSetRegistry([V1, V2, overlapping]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Overlapping/);
  });

  it('rejects invalid effective period (from > to)', () => {
    const invalid = rule({
      id: 'BR-BAD',
      effectiveFrom: LocalDate.from('2026-05-01'),
      effectiveTo: LocalDate.from('2026-04-01'),
    });
    const result = validateTaxRuleSetRegistry([invalid]);
    expect(result.valid).toBe(false);
  });

  it('does not flag rules in different jurisdictions as overlapping', () => {
    const other = rule({ id: 'US-V1', jurisdiction: 'US' });
    expect(validateTaxRuleSetRegistry([V1, other]).valid).toBe(true);
  });

  it('resolves the single effective rule', () => {
    const res = resolveTaxRuleSet([V1, V2], 'BR', LocalDate.from('2026-03-15'));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ruleSet.id).toBe('BR-V1');
  });

  it('fails closed when no rule covers the date', () => {
    const res = resolveTaxRuleSet([V2], 'BR', LocalDate.from('2026-03-15'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('MISSING_RULE_SET');
  });

  it('applies the rule on its exact effective date (boundary)', () => {
    const res = resolveTaxRuleSet([V1, V2], 'BR', LocalDate.from('2026-07-01'));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ruleSet.id).toBe('BR-V2');
  });

  it('uses the old rule on the day before the change', () => {
    const res = resolveTaxRuleSet([V1, V2], 'BR', LocalDate.from('2026-06-30'));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ruleSet.id).toBe('BR-V1');
  });

  it('treats a retired period as no longer effective after effectiveTo', () => {
    const res = resolveTaxRuleSet([V1], 'BR', LocalDate.from('2026-07-01'));
    expect(res.ok).toBe(false);
  });

  it('fails closed on ambiguous overlap', () => {
    const a = rule({ id: 'BR-A', effectiveFrom: LocalDate.from('2026-01-01') });
    const b = rule({ id: 'BR-B', effectiveFrom: LocalDate.from('2026-02-01') });
    const res = resolveTaxRuleSet([a, b], 'BR', LocalDate.from('2026-03-01'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('AMBIGUOUS_RULE_SET');
  });
});
