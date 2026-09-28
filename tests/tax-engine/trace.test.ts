import { describe, expect, it } from 'vitest';
import { calculateMonthlyTaxLiability, TAX_TRACE_STAGES } from '@atlas/tax-engine';
import { sale, verifiedRule } from './liability-helpers';

describe('Phase 4B — structured calculation trace', () => {
  it('emits structured stages with exact decimals and source references', () => {
    const r = calculateMonthlyTaxLiability({
      competence: '2026-09',
      events: [sale('s1', '2026-09-10', '300', '100')],
      ruleSets: [verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })],
    });
    const stages = new Set(r.calculationTrace.map((entry) => entry.stage));
    for (const stage of [
      'INPUT',
      'RULE_RESOLUTION',
      'CLASSIFICATION',
      'LOSS_APPLICATION',
      'TAXABLE_BASE',
      'RATE',
      'WITHHOLDING',
      'FINAL',
    ]) {
      expect(stages.has(stage as (typeof TAX_TRACE_STAGES)[number])).toBe(true);
    }
    const input = r.calculationTrace.find((e) => e.stage === 'INPUT')!;
    expect(input.inputReferences).toContain('s1');
    const rate = r.calculationTrace.find((e) => e.stage === 'RATE')!;
    expect(rate.ruleVersion).toBe('verified-1');
    expect(rate.exactInputs!.ratePercentage).toBe('15');
    expect(rate.exactOutput).toBe('15');
    // No JS-number money anywhere in the trace.
    expect(JSON.stringify(r.calculationTrace)).not.toMatch(/NaN|Infinity/);
  });

  it('is deterministic (logically identical trace across runs)', () => {
    const input = {
      competence: '2026-09' as const,
      events: [sale('s1', '2026-09-10', '300', '100'), sale('s2', '2026-09-15', '100', '20')],
      ruleSets: [verifiedRule('BRAZILIAN_EQUITY', { ratePercentage: '15' })],
    };
    const first = JSON.stringify(calculateMonthlyTaxLiability(input).calculationTrace);
    for (let i = 0; i < 200; i++) {
      expect(JSON.stringify(calculateMonthlyTaxLiability(input).calculationTrace)).toBe(first);
    }
  });
});
