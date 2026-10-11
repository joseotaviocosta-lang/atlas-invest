import { describe, it, expect } from 'vitest';
import {
  deriveTaxPaymentSupport,
  TaxComplianceObligation,
  TaxPaymentEvidenceRecord,
} from '../../packages/tax-engine/src';

function mockObligation(overrides: Partial<TaxComplianceObligation> = {}): TaxComplianceObligation {
  return {
    obligationKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:eq-6015',
    kind: 'MONTHLY_TAX_PAYMENT',
    taxSubjectId: 'user-1',
    calendarYear: 2026,
    period: '2026-03',
    title: 'DARF Mensal — Renda Variável',
    description: 'Imposto sobre operações em bolsa',
    dueDate: '2026-04-30',
    amount: '500.00',
    currency: 'BRL',
    status: 'PENDING',
    sourceFingerprint: 'fp-auth-source-v1',
    sourceModule: 'TAX_OBLIGATION',
    sourceRef: 'eq-6015',
    isLegalDeadline: true,
    authority: 'IN RFB 1585/2015',
    officialLink: 'https://www.gov.br/receitafederal',
    isOverdue: false,
    ...overrides,
  };
}

function mockEvidence(overrides: Partial<TaxPaymentEvidenceRecord> = {}): TaxPaymentEvidenceRecord {
  return {
    id: 'ev-1',
    taxSubjectId: 'user-1',
    obligationKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:eq-6015',
    revision: 1,
    sourceFingerprint: 'fp-auth-source-v1',
    paymentDate: '2026-04-20',
    amountReported: '500.00',
    revenueCodeReported: '6015',
    referencePeriod: '2026-03',
    externalReference: 'AUTH-12345',
    verificationStatus: 'USER_REPORTED',
    note: null,
    createdAt: '2026-04-20T12:00:00.000Z',
    ...overrides,
  };
}

describe('Phase 4K.2 — Tax Payment Support Property Tests', () => {
  it('Property 1 (Determinism): 1,000 runs on identical inputs yield byte-for-byte identical frozen read models', () => {
    const ob = mockObligation();
    const ev = mockEvidence();
    const reference = JSON.stringify(
      deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [ev] }),
    );

    for (let i = 0; i < 1000; i++) {
      const res = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [ev] });
      expect(JSON.stringify(res)).toBe(reference);
      expect(Object.isFrozen(res)).toBe(true);
    }
  });

  it('Property 2 (Source Fingerprint Sensitivity): any divergence between evidence and source toggles STALE_SOURCE', () => {
    const ob = mockObligation({ sourceFingerprint: 'fp-source-v2' });
    const ev = mockEvidence({ sourceFingerprint: 'fp-source-v1' });

    const res = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [ev] });
    expect(res).not.toBeNull();
    expect(res?.reconciliationStatus).toBe('STALE_SOURCE');
    expect(res?.supportStatus).toBe('STALE');
    expect(res?.latestEvidence?.isStale).toBe(true);
  });

  it('Property 3 (Exact Reconciliation Invariant): matching amount + period + code always yields USER_REPORTED_MATCH', () => {
    const ob = mockObligation({
      amount: '1234.56',
      period: '2026-05',
      metadata: { revenueCode: '6015' },
    });
    const ev = mockEvidence({
      amountReported: '1234.56',
      referencePeriod: '2026-05',
      revenueCodeReported: '6015',
      sourceFingerprint: ob.sourceFingerprint,
    });

    const res = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [ev] });
    expect(res?.reconciliationStatus).toBe('USER_REPORTED_MATCH');
    expect(res?.supportStatus).toBe('READY');
  });

  it('Property 4 (Mismatch Invariant): any mismatch in amount or period strictly produces USER_REPORTED_MISMATCH', () => {
    const ob = mockObligation({ amount: '500.00', period: '2026-03' });

    // Amount mismatch
    const evDiffAmount = mockEvidence({ amountReported: '499.99' });
    const res1 = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [evDiffAmount] });
    expect(res1?.reconciliationStatus).toBe('USER_REPORTED_MISMATCH');
    expect(res1?.supportStatus).toBe('REQUIRES_REVIEW');

    // Period mismatch
    const evDiffPeriod = mockEvidence({ referencePeriod: '2026-02' });
    const res2 = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [evDiffPeriod] });
    expect(res2?.reconciliationStatus).toBe('USER_REPORTED_MISMATCH');
    expect(res2?.supportStatus).toBe('REQUIRES_REVIEW');
  });

  it('Property 5 (Non-payable Safety): zero, negative, or non-payable obligations never produce READY support', () => {
    const zeroOb = mockObligation({ amount: '0' });
    expect(deriveTaxPaymentSupport({ obligation: zeroOb })).toBeNull();

    const zeroDecimalOb = mockObligation({ amount: '0.00' });
    expect(deriveTaxPaymentSupport({ obligation: zeroDecimalOb })).toBeNull();

    const negativeOb = mockObligation({ amount: '-50.00' });
    expect(deriveTaxPaymentSupport({ obligation: negativeOb })).toBeNull();

    const annualOb = mockObligation({ kind: 'ANNUAL_TAX_DECLARATION' });
    expect(deriveTaxPaymentSupport({ obligation: annualOb })).toBeNull();
  });

  it('Property 6 (Multi-revision Monotonicity): highest revision strictly dictates current reconciliation state', () => {
    const ob = mockObligation({ amount: '500.00' });
    const rev1Mismatch = mockEvidence({
      revision: 1,
      amountReported: '400.00',
      createdAt: '2026-04-01T10:00:00.000Z',
    });
    const rev2Match = mockEvidence({
      revision: 2,
      amountReported: '500.00',
      createdAt: '2026-04-02T10:00:00.000Z',
    });

    // Order shuffled in history input
    const res = deriveTaxPaymentSupport({
      obligation: ob,
      evidenceHistory: [rev1Mismatch, rev2Match],
    });
    expect(res?.latestEvidence?.revision).toBe(2);
    expect(res?.reconciliationStatus).toBe('USER_REPORTED_MATCH');

    const resInverted = deriveTaxPaymentSupport({
      obligation: ob,
      evidenceHistory: [rev2Match, rev1Mismatch],
    });
    expect(resInverted?.latestEvidence?.revision).toBe(2);
    expect(resInverted?.reconciliationStatus).toBe('USER_REPORTED_MATCH');
  });

  it('Property 7 (Deep Freeze Invariant): all returned structures are immutable', () => {
    const ob = mockObligation();
    const ev = mockEvidence();
    const res = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [ev] });
    expect(res).not.toBeNull();
    expect(Object.isFrozen(res)).toBe(true);
    expect(Object.isFrozen(res?.paymentInstructions)).toBe(true);
    expect(Object.isFrozen(res?.sourceReferences)).toBe(true);
    expect(Object.isFrozen(res?.latestEvidence)).toBe(true);
  });
});
