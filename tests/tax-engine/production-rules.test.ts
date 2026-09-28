import { describe, expect, it } from 'vitest';
import { Money } from '@atlas/domain';
import {
  calculateMonthlyTaxLiability,
  resolveTaxRuleSetForCategory,
  validateTaxRuleProvenance,
  type TaxRuleSet,
  type TaxWithholdingCredit,
} from '@atlas/tax-engine';
import {
  BR_FII_SALE_RULE,
  PRODUCTION_TAX_RULE_REGISTRY,
} from '../../apps/api/src/application/fiscal/fiscal-rule-registry';
import { sale, testOnlyRule, verifiedRule } from './liability-helpers';
import { LocalDate } from '@atlas/domain';

function credit(amount: string): TaxWithholdingCredit[] {
  return [
    { category: 'FII', currency: 'BRL', amount: Money.from(amount, 'BRL'), source: 'FISCAL_EVENT' },
  ];
}

function calcFii(events: ReturnType<typeof sale>[], credits?: TaxWithholdingCredit[]) {
  return calculateMonthlyTaxLiability({
    competence: '2026-09',
    events,
    ruleSets: PRODUCTION_TAX_RULE_REGISTRY,
    ...(credits ? { withholdingCredits: credits } : {}),
  });
}

describe('Phase 4B.5 — verified production rules (FII_SALE)', () => {
  it('the production registry contains at least one VERIFIED rule', () => {
    const verified = PRODUCTION_TAX_RULE_REGISTRY.filter((r) => r.status === 'VERIFIED');
    expect(verified.length).toBeGreaterThanOrEqual(1);
  });

  it('every VERIFIED production rule carries official provenance', () => {
    for (const rule of PRODUCTION_TAX_RULE_REGISTRY) {
      expect(validateTaxRuleProvenance(rule).valid).toBe(true);
      expect(rule.source?.legalSourceId).toBeTruthy();
      expect(rule.source?.legalSourceReference).toBeTruthy();
      expect(rule.source?.verifiedAt).toBeTruthy();
    }
  });

  it('rejects a VERIFIED rule without provenance', () => {
    const bad: TaxRuleSet = {
      id: 'BR-BAD',
      jurisdiction: 'BR',
      version: '1',
      status: 'VERIFIED',
      taxCategory: 'FII',
      effectiveFrom: LocalDate.from('2020-01-01'),
    };
    const result = validateTaxRuleProvenance(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/legalSourceId/);
  });

  it('does not let a TEST_ONLY rule satisfy production resolution', () => {
    const testRule = testOnlyRule('FII', { ratePercentage: '20' });
    const res = resolveTaxRuleSetForCategory([testRule], 'BR', 'FII', LocalDate.from('2026-09-30'));
    expect(res.ok).toBe(true);
    const liability = calculateMonthlyTaxLiability({
      competence: '2026-09',
      events: [sale('s', '2026-09-10', '2000', '1000', 'FII')],
      ruleSets: [testRule],
    });
    expect(liability.status).toBe('BLOCKED');
    expect(liability.categories[0]!.qualityIssues).toContain('UNVERIFIED_RULE_SET');
    expect(liability.taxDue).toBeNull();
  });

  it('produces a COMPLETE real liability using the VERIFIED FII rule + canonical IRRF', () => {
    const liability = calcFii([sale('s', '2026-09-10', '2000', '1000', 'FII')], credit('0.1'));
    expect(liability.status).toBe('COMPLETE');
    const c = liability.categories[0]!;
    expect(c.ruleSetStatus).toBe('VERIFIED');
    expect(c.ruleVersion).toBe('1.0.0');
    expect(c.taxBeforeWithholding.amount).toBe('200');
    expect(c.withholdingApplied.amount).toBe('0.1');
    expect(c.taxDue!.amount).toBe('199.9');
    expect(liability.taxDue!.amount).toBe('199.9');
  });

  it('produces a real zero (COMPLETE, taxDue "0") for a non-gain month', () => {
    const liability = calcFii([sale('s', '2026-09-10', '2000', '0', 'FII')], credit('0.1'));
    expect(liability.status).toBe('COMPLETE');
    expect(liability.categories[0]!.taxDue!.amount).toBe('0');
    expect(liability.taxDue!.amount).toBe('0');
  });

  it('fails closed (PARTIAL, null) when required canonical IRRF is absent', () => {
    const liability = calcFii([sale('s', '2026-09-10', '2000', '1000', 'FII')]);
    expect(liability.status).toBe('PARTIAL');
    expect(liability.categories[0]!.qualityIssues).toContain('MISSING_REQUIRED_WITHHOLDING');
    expect(liability.categories[0]!.taxDue).toBeNull();
    expect(liability.taxDue).toBeNull();
  });

  it('carries an FII loss forward without producing tax', () => {
    const liability = calcFii([sale('s', '2026-09-10', '2000', '-500', 'FII')], credit('0.1'));
    const c = liability.categories[0]!;
    expect(c.lossGenerated.amount).toBe('500');
    expect(c.closingLossBalance.amount).toBe('500');
    expect(c.taxDue!.amount).toBe('0');
  });

  it('does not compensate FII losses across buckets (equity remains fail-closed)', () => {
    const liability = calculateMonthlyTaxLiability({
      competence: '2026-09',
      events: [
        sale('fii', '2026-09-10', '2000', '-500', 'FII'),
        sale('eq', '2026-09-11', '3000', '1000', 'BRAZILIAN_EQUITY'),
      ],
      ruleSets: PRODUCTION_TAX_RULE_REGISTRY,
      openingLossBalances: [],
    });
    const fii = liability.categories.find((c) => c.category === 'FII')!;
    const equity = liability.categories.find((c) => c.category === 'BRAZILIAN_EQUITY')!;
    expect(fii.closingLossBalance.amount).toBe('500');
    // No verified equity rule exists → equity is blocked (no cross-bucket compensation).
    expect(equity.status).toBe('BLOCKED');
    expect(equity.qualityIssues).toContain('MISSING_RULE_SET');
    expect(liability.status).toBe('PARTIAL');
  });

  it('resolves the rule by effective date (historical competence)', () => {
    const res = resolveTaxRuleSetForCategory(
      PRODUCTION_TAX_RULE_REGISTRY,
      'BR',
      'FII',
      LocalDate.from('2016-03-15'),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ruleSet.id).toBe(BR_FII_SALE_RULE.id);
    // Before the rule's effective date there is no coverage.
    const before = resolveTaxRuleSetForCategory(
      PRODUCTION_TAX_RULE_REGISTRY,
      'BR',
      'FII',
      LocalDate.from('2010-01-01'),
    );
    expect(before.ok).toBe(false);
  });

  it('does not contain unsourced rate/threshold constants in the rule', () => {
    expect(BR_FII_SALE_RULE.components?.ratePercentage).toBe('20');
    expect(BR_FII_SALE_RULE.components?.exemptionGrossSalesThreshold).toBeUndefined();
    expect(BR_FII_SALE_RULE.source?.legalSourceId).toBe('IN-RFB-1585-2015-ART-37');
    // verifiedRule helper is synthetic and never in the production registry.
    expect(PRODUCTION_TAX_RULE_REGISTRY).not.toContainEqual(
      verifiedRule('FII', { ratePercentage: '20' }),
    );
  });
});
