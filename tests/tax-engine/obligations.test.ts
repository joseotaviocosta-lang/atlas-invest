import { describe, expect, it } from 'vitest';
import { Money } from '@atlas/domain';
import {
  calculateMonthlyTaxLiability,
  deriveObligationDisplayStatus,
  materializeTaxObligation,
  validateTaxPaymentEvidence,
  type MonthlyTaxLiability,
  type TaxWithholdingCredit,
} from '@atlas/tax-engine';
import { PRODUCTION_TAX_RULE_REGISTRY } from '../../apps/api/src/application/fiscal/fiscal-rule-registry';
import { PRODUCTION_FEDERAL_TAX_DEADLINE_REGISTRY } from '../../apps/api/src/application/fiscal/federal-tax-deadline-registry';
import { sale } from './liability-helpers';

const NOW = '2026-09-29';
const DEADLINES = PRODUCTION_FEDERAL_TAX_DEADLINE_REGISTRY;

function credit(amount: string): TaxWithholdingCredit[] {
  return [
    { category: 'FII', currency: 'BRL', amount: Money.from(amount, 'BRL'), source: 'FISCAL_EVENT' },
  ];
}

function fiiLiability(realized: string, withholding?: string): MonthlyTaxLiability {
  return calculateMonthlyTaxLiability({
    competence: '2026-08',
    events: [sale('s', '2026-08-10', '2000', realized, 'FII')],
    ruleSets: PRODUCTION_TAX_RULE_REGISTRY,
    ...(withholding ? { withholdingCredits: credit(withholding) } : {}),
  });
}

describe('Phase 4C.2 — TaxObligation materialization (never recalculates tax)', () => {
  it('COMPLETE positive liability + verified deadline → OPEN + DARF READY', () => {
    const plan = materializeTaxObligation({
      competence: '2026-08',
      liability: fiiLiability('1000', '0.1'),
      deadlineEntries: DEADLINES,
      now: NOW,
      inProgress: false,
    });
    expect(plan.status).toBe('OPEN');
    expect(plan.bucket).toBe('FII_SALE');
    expect(plan.revenueCode).toBe('6015');
    expect(plan.principalAmount).toBe('199.9');
    expect(plan.currency).toBe('BRL');
    expect(plan.dueDate).toBe('2026-09-30');
    expect(plan.deadlineEntryId).toBeTruthy();
    expect(plan.darfReadiness).toBe('READY');
  });

  it('COMPLETE zero liability → NO_PAYMENT_DUE + NOT_REQUIRED (no fake R$0 payable)', () => {
    const plan = materializeTaxObligation({
      competence: '2026-08',
      liability: fiiLiability('0', '0.1'),
      deadlineEntries: DEADLINES,
      now: NOW,
      inProgress: false,
    });
    expect(plan.status).toBe('NO_PAYMENT_DUE');
    expect(plan.principalAmount).toBeNull();
    expect(plan.darfReadiness).toBe('NOT_REQUIRED');
  });

  it('PARTIAL liability → BLOCKED (fail closed)', () => {
    const plan = materializeTaxObligation({
      competence: '2026-08',
      liability: fiiLiability('1000'),
      deadlineEntries: DEADLINES,
      now: NOW,
      inProgress: false,
    });
    expect(plan.status).toBe('BLOCKED');
    expect(plan.reasonCode).toBe('LIABILITY_PARTIAL');
    expect(plan.principalAmount).toBeNull();
  });

  it('BLOCKED liability → BLOCKED', () => {
    const blocked = calculateMonthlyTaxLiability({
      competence: '2026-08',
      events: [sale('eq', '2026-08-10', '2000', '1000', 'BRAZILIAN_EQUITY')],
      ruleSets: PRODUCTION_TAX_RULE_REGISTRY,
    });
    const plan = materializeTaxObligation({
      competence: '2026-08',
      liability: blocked,
      deadlineEntries: DEADLINES,
      now: NOW,
      inProgress: false,
    });
    expect(plan.status).toBe('BLOCKED');
    expect(plan.reasonCode).toBe('LIABILITY_BLOCKED');
  });

  it('mixed supported + unsupported activity never yields a misleading payable total', () => {
    const mixed = calculateMonthlyTaxLiability({
      competence: '2026-08',
      events: [
        sale('fii', '2026-08-10', '2000', '1000', 'FII'),
        sale('eq', '2026-08-11', '3000', '1000', 'BRAZILIAN_EQUITY'),
      ],
      ruleSets: PRODUCTION_TAX_RULE_REGISTRY,
    });
    expect(mixed.status).toBe('PARTIAL');
    const plan = materializeTaxObligation({
      competence: '2026-08',
      liability: mixed,
      deadlineEntries: DEADLINES,
      now: NOW,
      inProgress: false,
    });
    expect(plan.status).toBe('BLOCKED');
    expect(plan.principalAmount).toBeNull();
  });

  it('missing official deadline → BLOCKED MISSING_OFFICIAL_DEADLINE', () => {
    const plan = materializeTaxObligation({
      competence: '2026-08',
      liability: fiiLiability('1000', '0.1'),
      deadlineEntries: [],
      now: NOW,
      inProgress: false,
    });
    expect(plan.status).toBe('BLOCKED');
    expect(plan.reasonCode).toBe('MISSING_OFFICIAL_DEADLINE');
    expect(plan.darfReadiness).toBe('BLOCKED');
  });

  it('still-open competence → PROVISIONAL + PARTIAL readiness', () => {
    const plan = materializeTaxObligation({
      competence: '2026-09',
      liability: fiiLiability('1000', '0.1'),
      deadlineEntries: DEADLINES,
      now: NOW,
      inProgress: true,
    });
    expect(plan.status).toBe('PROVISIONAL');
    expect(plan.reasonCode).toBe('IN_PROGRESS_COMPETENCE');
    expect(plan.darfReadiness).toBe('PARTIAL');
  });

  it('derives temporal status from the injected clock (no penalty math)', () => {
    const before = deriveObligationDisplayStatus({
      status: 'OPEN',
      dueDate: '2026-09-30',
      now: '2026-09-29',
    });
    const onDue = deriveObligationDisplayStatus({
      status: 'OPEN',
      dueDate: '2026-09-30',
      now: '2026-09-30',
    });
    const after = deriveObligationDisplayStatus({
      status: 'OPEN',
      dueDate: '2026-09-30',
      now: '2026-10-01',
    });
    expect(before).toBe('OPEN');
    expect(onDue).toBe('DUE');
    expect(after).toBe('OVERDUE');
    // Non-open statuses are unchanged.
    expect(
      deriveObligationDisplayStatus({ status: 'PAID', dueDate: '2026-09-30', now: '2026-10-01' }),
    ).toBe('PAID');
  });
});

describe('Phase 4C.2 — manual payment evidence validation', () => {
  const obligation = { principalAmount: '199.9', currency: 'BRL', dueDate: '2026-09-30' };
  const PAY_NOW = '2026-10-01';

  it('accepts an exact full payment', () => {
    expect(
      validateTaxPaymentEvidence(
        {
          paidAt: '2026-09-30',
          amount: '199.9',
          currency: 'BRL',
          sourceType: 'MANUAL_CONFIRMED',
          confirmedAt: PAY_NOW,
        },
        obligation,
        PAY_NOW,
      ).valid,
    ).toBe(true);
  });

  it('rejects wrong amount, currency, negative, future date and unsupported source', () => {
    const check = (over: Record<string, string>) =>
      validateTaxPaymentEvidence(
        {
          paidAt: '2026-09-30',
          amount: '199.9',
          currency: 'BRL',
          sourceType: 'MANUAL_CONFIRMED',
          confirmedAt: PAY_NOW,
          ...over,
        },
        obligation,
        PAY_NOW,
      );
    expect(check({ amount: '100' })).toMatchObject({
      valid: false,
      code: 'PAYMENT.AMOUNT_MISMATCH',
    });
    expect(check({ currency: 'USD' })).toMatchObject({
      valid: false,
      code: 'PAYMENT.CURRENCY_MISMATCH',
    });
    expect(check({ amount: '-1' })).toMatchObject({ valid: false, code: 'PAYMENT.INVALID_AMOUNT' });
    expect(check({ paidAt: '2026-10-05' })).toMatchObject({
      valid: false,
      code: 'PAYMENT.FUTURE_DATE',
    });
    expect(check({ sourceType: 'BANK_SYNC' })).toMatchObject({
      valid: false,
      code: 'PAYMENT.UNSUPPORTED_SOURCE',
    });
  });
});
