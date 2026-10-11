import { describe, it, expect } from 'vitest';
import {
  deriveTaxPaymentSupport,
  TaxComplianceObligation,
  TaxPaymentEvidenceRecord,
  computeTaxSettlementEvidenceFingerprint,
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
    metadata: { revenueCode: '6015' },
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

describe('Phase 4K.2A — Tax Payment Support Property Tests (All 8 Required)', () => {
  it('1. payment support determinism: 1,000 runs on identical inputs yield byte-for-byte identical frozen read models', () => {
    const ob = mockObligation();
    const ev = mockEvidence();
    const reference = JSON.stringify(
      deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [ev] }),
    );

    for (let i = 0; i < 1000; i++) {
      const res = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [ev] });
      expect(JSON.stringify(res)).toBe(reference);
      expect(Object.isFrozen(res)).toBe(true);
      expect(Object.isFrozen(res?.paymentInstructions)).toBe(true);
      expect(Object.isFrozen(res?.sourceReferences)).toBe(true);
      expect(Object.isFrozen(res?.latestEvidence)).toBe(true);
    }
  });

  it('2. source fingerprint sensitivity: any divergence between evidence and source toggles STALE_SOURCE', () => {
    const ob = mockObligation({ sourceFingerprint: 'fp-source-v2' });
    const ev = mockEvidence({ sourceFingerprint: 'fp-source-v1' });

    const res = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [ev] });
    expect(res).not.toBeNull();
    expect(res?.reconciliationStatus).toBe('STALE_SOURCE');
    expect(res?.supportStatus).toBe('STALE');
    expect(res?.latestEvidence?.isStale).toBe(true);
  });

  it('3. evidence reconciliation determinism: identical inputs across multiple runs yield identical status and amounts', () => {
    const ob = mockObligation({ amount: '750.50', period: '2026-04' });
    const ev = mockEvidence({
      amountReported: '750.50',
      referencePeriod: '2026-04',
      revenueCodeReported: '6015',
      sourceFingerprint: ob.sourceFingerprint,
    });

    const res1 = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [ev] });
    const res2 = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [ev] });
    expect(res1?.reconciliationStatus).toBe('USER_REPORTED_MATCH');
    expect(res2?.reconciliationStatus).toBe('USER_REPORTED_MATCH');
    expect(res1?.amount).toBe('750.50');
    expect(res2?.amount).toBe('750.50');
    expect(res1?.latestEvidence?.amountReported).toBe('750.50');
    expect(res2?.latestEvidence?.amountReported).toBe('750.50');
  });

  it('4. null/zero distinction: zero, null, negative, or non-payable obligations never produce READY support', () => {
    const zeroOb = mockObligation({ amount: '0' });
    expect(deriveTaxPaymentSupport({ obligation: zeroOb })).toBeNull();

    const zeroDecimalOb = mockObligation({ amount: '0.00' });
    expect(deriveTaxPaymentSupport({ obligation: zeroDecimalOb })).toBeNull();

    const nullAmountOb = mockObligation({ amount: null });
    expect(deriveTaxPaymentSupport({ obligation: nullAmountOb })).toBeNull();

    const negativeOb = mockObligation({ amount: '-50.00' });
    expect(deriveTaxPaymentSupport({ obligation: negativeOb })).toBeNull();

    const nullDueDateOb = mockObligation({ dueDate: null });
    expect(deriveTaxPaymentSupport({ obligation: nullDueDateOb })).toBeNull();

    const annualOb = mockObligation({ kind: 'ANNUAL_TAX_DECLARATION' });
    expect(deriveTaxPaymentSupport({ obligation: annualOb })).toBeNull();
  });

  it('5. match/mismatch stability: exact match yields USER_REPORTED_MATCH; amount, period, or code difference strictly yields USER_REPORTED_MISMATCH', () => {
    const ob = mockObligation({
      amount: '500.00',
      period: '2026-03',
      metadata: { revenueCode: '6015' },
    });

    // Exact Match
    const evMatch = mockEvidence({
      amountReported: '500.00',
      referencePeriod: '2026-03',
      revenueCodeReported: '6015',
    });
    const resMatch = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [evMatch] });
    expect(resMatch?.reconciliationStatus).toBe('USER_REPORTED_MATCH');
    expect(resMatch?.supportStatus).toBe('READY');

    // Amount Mismatch
    const evDiffAmount = mockEvidence({ amountReported: '499.99' });
    const resDiffAmt = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [evDiffAmount] });
    expect(resDiffAmt?.reconciliationStatus).toBe('USER_REPORTED_MISMATCH');
    expect(resDiffAmt?.supportStatus).toBe('REQUIRES_REVIEW');

    // Period Mismatch
    const evDiffPeriod = mockEvidence({ referencePeriod: '2026-02' });
    const resDiffPer = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [evDiffPeriod] });
    expect(resDiffPer?.reconciliationStatus).toBe('USER_REPORTED_MISMATCH');
    expect(resDiffPer?.supportStatus).toBe('REQUIRES_REVIEW');

    // Revenue Code Mismatch
    const evDiffCode = mockEvidence({ revenueCodeReported: '8900' });
    const resDiffCode = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [evDiffCode] });
    expect(resDiffCode?.reconciliationStatus).toBe('USER_REPORTED_MISMATCH');
    expect(resDiffCode?.supportStatus).toBe('REQUIRES_REVIEW');
  });

  it('6. stale evidence determinism: prior evidence recorded against older source fingerprint remains deterministically stale', () => {
    const obNew = mockObligation({ sourceFingerprint: 'fp-source-v2', amount: '600.00' });
    const evOld = mockEvidence({
      sourceFingerprint: 'fp-source-v1',
      amountReported: '500.00',
      revision: 1,
    });

    const res = deriveTaxPaymentSupport({ obligation: obNew, evidenceHistory: [evOld] });
    expect(res?.reconciliationStatus).toBe('STALE_SOURCE');
    expect(res?.supportStatus).toBe('STALE');
    expect(res?.latestEvidence?.isStale).toBe(true);
    expect(res?.amount).toBe('600.00'); // Authoritative amount is preserved
  });

  it('7. semantic dedup: N identical semantic evidence inputs produce exactly one identical evidenceFingerprint and canonical outcome', () => {
    const ob = mockObligation();
    const basePayload = {
      taxSubjectId: 'user-1',
      obligationKey: ob.obligationKey,
      sourceFingerprint: ob.sourceFingerprint,
      paymentDate: '2026-04-20',
      amountReported: '500.00',
      revenueCodeReported: '6015',
      referencePeriod: '2026-03',
      externalReference: 'REF-SAME',
      note: 'Same note',
      verificationStatus: 'USER_REPORTED',
    };

    const fp = computeTaxSettlementEvidenceFingerprint(basePayload);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);

    // Any number of duplicate identical submissions generate the exact same fingerprint
    for (const count of [2, 5, 10, 50, 100]) {
      const duplicateFps = Array.from({ length: count }, () =>
        computeTaxSettlementEvidenceFingerprint(basePayload),
      );
      expect(new Set(duplicateFps).size).toBe(1);
    }

    const evA = mockEvidence({
      id: 'ev-1a',
      revision: 1,
      evidenceFingerprint: fp,
      createdAt: '2026-04-20T12:00:00.000Z',
    });
    const evB = mockEvidence({
      id: 'ev-1b',
      revision: 1,
      evidenceFingerprint: fp,
      createdAt: '2026-04-20T12:00:01.000Z',
    });

    const res = deriveTaxPaymentSupport({ obligation: ob, evidenceHistory: [evA, evB] });
    expect(res?.latestEvidence?.id).toBe('ev-1b');
    expect(res?.latestEvidence?.revision).toBe(1);
    expect(res?.latestEvidence?.evidenceFingerprint).toBe(fp);
    expect(res?.reconciliationStatus).toBe('USER_REPORTED_MATCH');
  });

  it('8. history preservation: all historical revisions are preserved and highest revision monotonically dictates state', () => {
    const ob = mockObligation({ amount: '500.00' });
    const rev1Mismatch = mockEvidence({
      id: 'ev-rev-1',
      revision: 1,
      amountReported: '400.00',
      createdAt: '2026-04-01T10:00:00.000Z',
    });
    const rev2Match = mockEvidence({
      id: 'ev-rev-2',
      revision: 2,
      amountReported: '500.00',
      createdAt: '2026-04-02T10:00:00.000Z',
    });

    // Shuffled input order
    const res1 = deriveTaxPaymentSupport({
      obligation: ob,
      evidenceHistory: [rev1Mismatch, rev2Match],
    });
    expect(res1?.latestEvidence?.id).toBe('ev-rev-2');
    expect(res1?.latestEvidence?.revision).toBe(2);
    expect(res1?.reconciliationStatus).toBe('USER_REPORTED_MATCH');

    // Inverted input order preserves exact same outcome
    const res2 = deriveTaxPaymentSupport({
      obligation: ob,
      evidenceHistory: [rev2Match, rev1Mismatch],
    });
    expect(res2?.latestEvidence?.id).toBe('ev-rev-2');
    expect(res2?.latestEvidence?.revision).toBe(2);
    expect(res2?.reconciliationStatus).toBe('USER_REPORTED_MATCH');
  });

  it('9. distinctness property: changing any material evidence field produces a different evidenceFingerprint', () => {
    const base = {
      taxSubjectId: 'user-1',
      obligationKey: 'user-1:2026-03:MONTHLY_TAX_PAYMENT:eq-6015',
      sourceFingerprint: 'fp-auth-source-v1',
      paymentDate: '2026-04-20',
      amountReported: '500.00',
      revenueCodeReported: '6015',
      referencePeriod: '2026-03',
      externalReference: 'REF-1',
      note: 'Note 1',
      verificationStatus: 'USER_REPORTED',
    };
    const baseFp = computeTaxSettlementEvidenceFingerprint(base);

    // Material variations:
    const diffAmount = computeTaxSettlementEvidenceFingerprint({
      ...base,
      amountReported: '500.01',
    });
    const diffDate = computeTaxSettlementEvidenceFingerprint({
      ...base,
      paymentDate: '2026-04-21',
    });
    const diffRevCode = computeTaxSettlementEvidenceFingerprint({
      ...base,
      revenueCodeReported: '8900',
    });
    const diffPeriod = computeTaxSettlementEvidenceFingerprint({
      ...base,
      referencePeriod: '2026-02',
    });
    const diffRef = computeTaxSettlementEvidenceFingerprint({
      ...base,
      externalReference: 'REF-2',
    });
    const diffNote = computeTaxSettlementEvidenceFingerprint({ ...base, note: 'Note 2' });
    const diffSourceFp = computeTaxSettlementEvidenceFingerprint({
      ...base,
      sourceFingerprint: 'fp-auth-source-v2',
    });
    const diffSubject = computeTaxSettlementEvidenceFingerprint({
      ...base,
      taxSubjectId: 'user-2',
    });

    expect(diffAmount).not.toBe(baseFp);
    expect(diffDate).not.toBe(baseFp);
    expect(diffRevCode).not.toBe(baseFp);
    expect(diffPeriod).not.toBe(baseFp);
    expect(diffRef).not.toBe(baseFp);
    expect(diffNote).not.toBe(baseFp);
    expect(diffSourceFp).not.toBe(baseFp);
    expect(diffSubject).not.toBe(baseFp);

    // All variations must be pairwise distinct
    const allFps = new Set([
      baseFp,
      diffAmount,
      diffDate,
      diffRevCode,
      diffPeriod,
      diffRef,
      diffNote,
      diffSourceFp,
      diffSubject,
    ]);
    expect(allFps.size).toBe(9);
  });

  it('10. evidence replay property: replaying identical payload 1, 10, 100, 1,000 times yields same semantic identity', () => {
    const payload = {
      taxSubjectId: 'user-replay',
      obligationKey: 'user-replay:2026-01:MONTHLY_TAX_PAYMENT:eq-6015',
      sourceFingerprint: 'fp-replay-v1',
      paymentDate: '2026-02-28',
      amountReported: '1500.00',
      revenueCodeReported: '6015',
      referencePeriod: '2026-01',
      externalReference: 'REPLAY-1',
      note: 'Replay test',
      verificationStatus: 'USER_REPORTED',
    };

    const first = computeTaxSettlementEvidenceFingerprint(payload);
    for (const n of [1, 10, 100, 1000]) {
      for (let i = 0; i < n; i++) {
        expect(computeTaxSettlementEvidenceFingerprint(payload)).toBe(first);
      }
    }
  });

  it('11. stale-never-match invariant: evidence recorded against divergent source fingerprint NEVER reconciles as USER_REPORTED_MATCH', () => {
    const obCurrent = mockObligation({
      sourceFingerprint: 'fp-current-source-v2',
      amount: '500.00',
      period: '2026-03',
    });

    const evStale = mockEvidence({
      sourceFingerprint: 'fp-old-source-v1',
      amountReported: '500.00', // Identical amount
      referencePeriod: '2026-03', // Identical period
      revenueCodeReported: '6015', // Identical revenue code
    });

    const support = deriveTaxPaymentSupport({
      obligation: obCurrent,
      evidenceHistory: [evStale],
    });

    expect(support).not.toBeNull();
    // Critical invariant: Even though amount, period and revenue code match, divergent sourceFingerprint
    // guarantees that reconciliationStatus is NEVER USER_REPORTED_MATCH.
    expect(support?.reconciliationStatus).not.toBe('USER_REPORTED_MATCH');
    expect(support?.reconciliationStatus).toBe('STALE_SOURCE');
    expect(support?.supportStatus).toBe('STALE');
    expect(support?.latestEvidence?.isStale).toBe(true);
  });
});
