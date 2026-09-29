import { describe, expect, it } from 'vitest';
import {
  roundHalfEven,
  monthsBetween,
  daysBetweenInclusive,
  buildTaxPaymentAdjustment,
  type OfficialInterestRate,
  type OfficialLateFeeAuthority,
} from '@atlas/tax-engine';
import { BR_FEDERAL_LATE_PAYMENT_RULE } from '../../apps/api/src/application/fiscal/federal-late-payment-registry';

const rule = BR_FEDERAL_LATE_PAYMENT_RULE;

function authority(over: Partial<OfficialLateFeeAuthority>): OfficialLateFeeAuthority {
  return {
    snapshotId: 'snap-1',
    version: 1,
    startBusinessDate: null,
    amount: '0',
    percentage: '0',
    ...over,
  };
}

function rate(referenceMonth: string, ratePercent: string): OfficialInterestRate {
  return { snapshotId: `selic-${referenceMonth}`, version: 1, referenceMonth, ratePercent };
}

describe('Phase 4D.2 — ROUND_HALF_EVEN (official Sicalc rounding)', () => {
  it('matches the official Sicalc tie behavior', () => {
    expect(roundHalfEven('0.165', 2)).toBe('0.16');
    expect(roundHalfEven('0.825', 2)).toBe('0.82');
    expect(roundHalfEven('0.495', 2)).toBe('0.50');
    expect(roundHalfEven('1.155', 2)).toBe('1.16');
    expect(roundHalfEven('0.65967', 2)).toBe('0.66');
  });

  it('is exact for ordinary values and integers', () => {
    expect(roundHalfEven('1.999', 2)).toBe('2.00');
    expect(roundHalfEven('0.00033', 2)).toBe('0.00');
    expect(roundHalfEven('60.60606', 0)).toBe('61');
  });
});

describe('Phase 4D.2 — date helpers', () => {
  it('lists months strictly between due and payment months', () => {
    expect(monthsBetween('2026-09', '2026-10')).toEqual([]);
    expect(monthsBetween('2025-01', '2025-04')).toEqual(['2025-02', '2025-03']);
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-12', '2026-01']);
  });

  it('counts inclusive calendar days', () => {
    expect(daysBetweenInclusive('2026-10-01', '2026-10-01')).toBe(1);
    expect(daysBetweenInclusive('2025-01-16', '2025-04-10')).toBe(85);
  });
});

describe('Phase 4D.2 — overdue adjustment (production examples)', () => {
  it('Example A: 199.90 → 0.66 + 2.00 = 202.56', () => {
    const adjustment = buildTaxPaymentAdjustment({
      obligationId: 'ob-1',
      obligationFingerprint: 'fp-1',
      principalAmount: '199.90',
      currency: 'BRL',
      dueDate: '2026-09-30',
      paymentDate: '2026-10-01',
      rule,
      lateFeeAuthority: authority({
        amount: '0.66',
        percentage: '0.33',
        startBusinessDate: '2026-10-01',
      }),
      interestRates: [],
    });
    expect(adjustment.status).toBe('READY');
    expect(adjustment.lateFeeAmount).toBe('0.66');
    expect(adjustment.interestAmount).toBe('2.00');
    expect(adjustment.updatedAmount).toBe('202.56');
    expect(adjustment.principalAmount).toBe('199.90');
  });

  it('Example B: 1000.00 → 200.00 + 29.50 = 1229.50 (cap + multi-month SELIC)', () => {
    const adjustment = buildTaxPaymentAdjustment({
      obligationId: 'ob-2',
      obligationFingerprint: 'fp-2',
      principalAmount: '1000.00',
      currency: 'BRL',
      dueDate: '2025-01-15',
      paymentDate: '2025-04-10',
      rule,
      lateFeeAuthority: authority({
        amount: '200.00',
        percentage: '20',
        startBusinessDate: '2025-01-16',
      }),
      interestRates: [rate('2025-02', '0.99'), rate('2025-03', '0.96')],
    });
    expect(adjustment.status).toBe('READY');
    expect(adjustment.lateFeeAmount).toBe('200.00');
    expect(adjustment.interestAmount).toBe('29.50');
    expect(adjustment.updatedAmount).toBe('1229.50');
  });

  it('same-month payment charges no interest', () => {
    const adjustment = buildTaxPaymentAdjustment({
      obligationId: 'ob-3',
      obligationFingerprint: 'fp-3',
      principalAmount: '100.00',
      currency: 'BRL',
      dueDate: '2026-09-10',
      paymentDate: '2026-09-20',
      rule,
      lateFeeAuthority: authority({ amount: '10.00', percentage: '10' }),
      interestRates: [],
    });
    expect(adjustment.status).toBe('READY');
    expect(adjustment.interestPercentage).toBe('0');
    expect(adjustment.interestAmount).toBe('0.00');
    expect(adjustment.lateFeeAmount).toBe('10.00');
  });

  it('uses a simple SELIC sum, not compounding', () => {
    const adjustment = buildTaxPaymentAdjustment({
      obligationId: 'ob-4',
      obligationFingerprint: 'fp-4',
      principalAmount: '100.00',
      currency: 'BRL',
      dueDate: '2025-01-15',
      paymentDate: '2025-03-10',
      rule,
      lateFeeAuthority: authority({ amount: '0', percentage: '0' }),
      interestRates: [rate('2025-02', '1.00')],
    });
    // 1% (payment month) + 1% (Feb) = 2% simple (compounded would be 2.01%).
    expect(adjustment.interestPercentage).toBe('2');
    expect(adjustment.interestAmount).toBe('2.00');
  });

  it('is NOT_LATE on or before the due date (no authority needed)', () => {
    const adjustment = buildTaxPaymentAdjustment({
      obligationId: 'ob-5',
      obligationFingerprint: 'fp-5',
      principalAmount: '199.90',
      currency: 'BRL',
      dueDate: '2026-09-30',
      paymentDate: '2026-09-30',
      rule,
      lateFeeAuthority: null,
      interestRates: [],
    });
    expect(adjustment.status).toBe('NOT_LATE');
    expect(adjustment.updatedAmount).toBe('199.90');
    expect(adjustment.lateFeeAmount).toBe('0.00');
    expect(adjustment.interestAmount).toBe('0.00');
  });

  it('fails closed without official late-fee authority', () => {
    const adjustment = buildTaxPaymentAdjustment({
      obligationId: 'ob-6',
      obligationFingerprint: 'fp-6',
      principalAmount: '199.90',
      currency: 'BRL',
      dueDate: '2026-09-30',
      paymentDate: '2026-10-01',
      rule,
      lateFeeAuthority: null,
      interestRates: [],
    });
    expect(adjustment.status).toBe('BLOCKED');
    expect(adjustment.reasonCode).toBe('MISSING_LATE_FEE_AUTHORITY');
  });

  it('fails closed on a missing required SELIC rate', () => {
    const adjustment = buildTaxPaymentAdjustment({
      obligationId: 'ob-7',
      obligationFingerprint: 'fp-7',
      principalAmount: '1000.00',
      currency: 'BRL',
      dueDate: '2025-01-15',
      paymentDate: '2025-04-10',
      rule,
      lateFeeAuthority: authority({ amount: '200.00', percentage: '20' }),
      interestRates: [rate('2025-02', '0.99')], // 2025-03 missing
    });
    expect(adjustment.status).toBe('BLOCKED');
    expect(adjustment.reasonCode).toBe('MISSING_OFFICIAL_INTEREST_RATE');
  });

  it('fails closed on authority parity mismatch', () => {
    const adjustment = buildTaxPaymentAdjustment({
      obligationId: 'ob-8',
      obligationFingerprint: 'fp-8',
      principalAmount: '199.90',
      currency: 'BRL',
      dueDate: '2026-09-30',
      paymentDate: '2026-10-01',
      rule,
      lateFeeAuthority: authority({ amount: '0.99', percentage: '0.33' }), // inconsistent
      interestRates: [],
    });
    expect(adjustment.status).toBe('BLOCKED');
    expect(adjustment.reasonCode).toBe('AUTHORITY_PARITY_MISMATCH');
  });

  it('produces a deterministic fingerprint', () => {
    const input = {
      obligationId: 'ob-9',
      obligationFingerprint: 'fp-9',
      principalAmount: '199.90',
      currency: 'BRL',
      dueDate: '2026-09-30',
      paymentDate: '2026-10-01',
      rule,
      lateFeeAuthority: authority({
        amount: '0.66',
        percentage: '0.33',
        startBusinessDate: '2026-10-01',
      }),
      interestRates: [] as OfficialInterestRate[],
    };
    const a = buildTaxPaymentAdjustment(input);
    const b = buildTaxPaymentAdjustment(input);
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});
