import { describe, expect, it } from 'vitest';
import { LocalDate, Money } from '@atlas/domain';
import {
  evaluateTaxInputReadiness,
  fiscalCompetenceFromString,
  validateTaxWithholdingInput,
  withholdingConfirmedTotal,
  type TaxWithholdingInput,
} from '@atlas/tax-engine';

const withholding = (over: Partial<TaxWithholdingInput> = {}): TaxWithholdingInput => ({
  id: 'w-1',
  sourceReference: 'broker-import-1',
  sourceType: 'BROKER_IMPORT',
  economicDate: LocalDate.from('2026-09-10'),
  competence: fiscalCompetenceFromString('2026-09'),
  category: 'BRAZILIAN_EQUITY',
  currency: 'BRL',
  amount: Money.from('12.34', 'BRL'),
  status: 'CONFIRMED',
  provenance: { source: 'BROKER_IMPORT', sourceReference: 'broker-import-1' },
  ...over,
});

describe('Phase 4B.2 — canonical withholding input', () => {
  it('accepts a confirmed canonical withholding', () => {
    expect(validateTaxWithholdingInput(withholding()).valid).toBe(true);
  });

  it('never carries a fabricated amount for UNKNOWN status', () => {
    const bad = validateTaxWithholdingInput(withholding({ status: 'UNKNOWN' }));
    expect(bad.valid).toBe(false);
    const good = validateTaxWithholdingInput(withholding({ status: 'UNKNOWN', amount: undefined }));
    expect(good.valid).toBe(true);
  });

  it('rejects missing amount for CONFIRMED/UNVERIFIED', () => {
    expect(validateTaxWithholdingInput(withholding({ amount: undefined })).valid).toBe(false);
  });

  it('rejects negative amounts and currency mismatch', () => {
    expect(
      validateTaxWithholdingInput(withholding({ amount: Money.from('-1', 'BRL') })).valid,
    ).toBe(false);
    expect(
      validateTaxWithholdingInput(withholding({ currency: 'USD', amount: Money.from('1', 'BRL') }))
        .valid,
    ).toBe(false);
  });

  it('rejects unknown sourceType/status and missing sourceReference', () => {
    expect(validateTaxWithholdingInput(withholding({ sourceType: 'GUESS' as never })).valid).toBe(
      false,
    );
    expect(validateTaxWithholdingInput(withholding({ status: 'MAYBE' as never })).valid).toBe(
      false,
    );
    expect(validateTaxWithholdingInput(withholding({ sourceReference: '' })).valid).toBe(false);
  });

  it('aggregates confirmed totals with exact decimal arithmetic', () => {
    const total = withholdingConfirmedTotal(
      [
        withholding({ id: 'a', amount: Money.from('0.1', 'BRL') }),
        withholding({ id: 'b', amount: Money.from('0.2', 'BRL') }),
        withholding({ id: 'c', amount: Money.from('99', 'BRL'), status: 'UNVERIFIED' }),
      ],
      'BRL',
    );
    expect(total.amount).toBe('0.3');
  });

  it('preserves extreme decimal precision', () => {
    const total = withholdingConfirmedTotal(
      [withholding({ amount: Money.from('12345.678901234567890123', 'BRL') })],
      'BRL',
    );
    expect(total.amount).toBe('12345.678901234567890123');
  });

  it('marks withholding MISSING when required but absent, and PARTIAL when unverified', () => {
    const missing = evaluateTaxInputReadiness({
      competence: fiscalCompetenceFromString('2026-09'),
      requiresWithholding: true,
      withholdingInputs: [],
    });
    expect(missing.withholdingStatus).toBe('MISSING');
    expect(missing.issues).toContain('MISSING_WITHHOLDING_INPUT');

    const unverified = evaluateTaxInputReadiness({
      competence: fiscalCompetenceFromString('2026-09'),
      requiresWithholding: true,
      withholdingInputs: [withholding({ status: 'UNVERIFIED' })],
    });
    expect(unverified.withholdingStatus).toBe('PARTIAL');
    expect(unverified.issues).toContain('UNVERIFIED_WITHHOLDING');

    const complete = evaluateTaxInputReadiness({
      competence: fiscalCompetenceFromString('2026-09'),
      requiresWithholding: true,
      withholdingInputs: [withholding()],
    });
    expect(complete.withholdingStatus).toBe('COMPLETE');
  });

  it('is NOT_REQUIRED when no withholding is needed', () => {
    const readiness = evaluateTaxInputReadiness({
      competence: fiscalCompetenceFromString('2026-09'),
    });
    expect(readiness.withholdingStatus).toBe('NOT_REQUIRED');
    expect(readiness.capabilities.withholdingComplete).toBe(true);
  });
});
