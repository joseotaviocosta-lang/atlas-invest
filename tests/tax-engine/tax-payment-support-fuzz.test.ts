import { describe, it, expect } from 'vitest';
import {
  deriveTaxPaymentSupport,
  TaxComplianceObligation,
  TaxPaymentEvidenceRecord,
  TAX_PAYMENT_SUPPORT_DISCLAIMER,
  TAX_PAYMENT_RECONCILIATION_STATUSES,
  TAX_PAYMENT_SUPPORT_STATUSES,
} from '../../packages/tax-engine/src';

describe('Phase 4K.2 — Tax Payment Support Fuzz Test (20,000 iterations)', () => {
  it('fuzzes deriveTaxPaymentSupport over 20,000 randomized obligation & evidence permutations without crashing', () => {
    const kinds = [
      'MONTHLY_TAX_PAYMENT',
      'ANNUAL_TAX_DECLARATION',
      'HIGH_INCOME_MINIMUM_TAX_REVIEW',
      'ANNUAL_UNIFIED_REPORTING',
    ] as const;

    const statuses = [
      'PENDING',
      'DUE_SOON',
      'OVERDUE',
      'COMPLETED',
      'DISMISSED',
      'SUPERSEDED',
    ] as const;

    const amounts = [
      null,
      '0',
      '0.00',
      '-10.00',
      '0.01',
      '10.50',
      '500.00',
      '12345.67',
      '999999999.99',
    ];

    const fingerprints = ['fp-a', 'fp-b', 'fp-c', 'fp-d'];
    const periods = ['2026-01', '2026-02', '2026-03', '2026-12', 'invalid-period'];
    const codes = [null, '6015', '0190', '8900'];

    const reconciliationStatusSet = new Set<string>(TAX_PAYMENT_RECONCILIATION_STATUSES);
    const supportStatusSet = new Set<string>(TAX_PAYMENT_SUPPORT_STATUSES);

    let nonNullCount = 0;
    let nullCount = 0;

    for (let i = 0; i < 20_000; i++) {
      const kind = kinds[i % kinds.length];
      const status = statuses[i % statuses.length];
      const amount = amounts[i % amounts.length];
      const period = periods[i % periods.length];
      const sourceFingerprint = fingerprints[i % fingerprints.length];
      const revenueCode = codes[i % codes.length];

      const obligation: TaxComplianceObligation = {
        obligationKey: `user-fuzz:${period}:${kind}:ref-${i % 10}`,
        kind,
        taxSubjectId: 'user-fuzz',
        calendarYear: 2026,
        period,
        title: `Obligation ${i}`,
        description: `Description ${i}`,
        dueDate: i % 5 === 0 ? '' : '2026-04-30',
        amount,
        currency: 'BRL',
        status,
        sourceFingerprint,
        sourceModule: 'TAX_OBLIGATION',
        sourceRef: `ref-${i % 10}`,
        isLegalDeadline: true,
        authority: 'Authority',
        officialLink: null,
        isOverdue: i % 3 === 0,
        metadata: revenueCode ? { revenueCode } : undefined,
      };

      // Generate 0 to 3 random evidence records
      const evidenceCount = i % 4;
      const evidenceHistory: TaxPaymentEvidenceRecord[] = [];
      for (let r = 1; r <= evidenceCount; r++) {
        const matchesFingerprint = (i + r) % 2 === 0;
        const matchesAmount = (i + r) % 3 === 0;
        evidenceHistory.push({
          id: `ev-fuzz-${i}-${r}`,
          taxSubjectId: 'user-fuzz',
          obligationKey: obligation.obligationKey,
          revision: r,
          sourceFingerprint: matchesFingerprint ? sourceFingerprint : 'fp-divergent',
          paymentDate: '2026-04-15',
          amountReported: matchesAmount && amount ? amount : '99.99',
          revenueCodeReported: revenueCode ?? '6015',
          referencePeriod: period,
          externalReference: null,
          verificationStatus: 'USER_REPORTED',
          note: null,
          createdAt: `2026-04-15T10:00:0${r}.000Z`,
        });
      }

      const res = deriveTaxPaymentSupport({ obligation, evidenceHistory });

      if (res === null) {
        nullCount++;
        // Invariant: If res is null, obligation was non-payable or wrong kind or missing dueDate
        const isPayableKind = kind === 'MONTHLY_TAX_PAYMENT';
        const hasPositiveAmount =
          amount !== null && amount !== '0' && amount !== '0.00' && !amount.startsWith('-');
        const hasDueDate = Boolean(obligation.dueDate);
        expect(isPayableKind && hasPositiveAmount && hasDueDate).toBe(false);
      } else {
        nonNullCount++;
        expect(res.version).toBe('4K.2');
        expect(res.disclaimer).toBe(TAX_PAYMENT_SUPPORT_DISCLAIMER);
        expect(res.obligationKey).toBe(obligation.obligationKey);
        expect(res.amount).toBe(obligation.amount);
        expect(reconciliationStatusSet.has(res.reconciliationStatus)).toBe(true);
        expect(supportStatusSet.has(res.supportStatus)).toBe(true);
        expect(Object.isFrozen(res)).toBe(true);

        if (obligation.status === 'SUPERSEDED') {
          expect(res.supportStatus).toBe('STALE');
        }
      }
    }

    expect(nullCount).toBeGreaterThan(15_000);
    expect(nonNullCount).toBeGreaterThan(2_000);
  });
});
