import { describe, it, expect } from 'vitest';
import {
  applyPreBaselineSnapshotGate,
  canonicalFingerprint,
  classifyOne,
  resolveAsset,
  resolveAccount,
  validateUnsettledResolutionMetadata,
  verifyUnsettledTradeResolution,
  type AssetMatch,
} from '@atlas/import-engine';
import type { ClassifiedCandidate, ExistingLedgerRow } from '@atlas/import-engine';

const PORTFOLIO = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const KCRE = '33333333-3333-4333-8333-333333333333';

function buyCandidate(overrides: Partial<ClassifiedCandidate> = {}): ClassifiedCandidate {
  return {
    rowNumber: 61,
    tradeDate: '2024-12-27',
    ticker: 'KCRE11',
    operation: 'BUY',
    rawOperation: 'Compra',
    quantity: '80',
    unitPrice: '8.45',
    fees: '0',
    currency: 'BRL',
    brokerLabel: 'XP INVESTIMENTOS CCTVM S/A',
    status: 'READY',
    issues: [],
    assetId: KCRE,
    assetResolution: 'RESOLVED',
    targetAssetId: null,
    targetAssetResolution: 'NOT_FOUND',
    accountId: ACCOUNT,
    accountResolution: 'RESOLVED',
    fingerprint: 'fp-kcre-80',
    duplicate: 'NEW',
    provider: 'B3',
    ...overrides,
  } as ClassifiedCandidate;
}

function openingRow(overrides: Partial<ExistingLedgerRow> = {}): ExistingLedgerRow {
  return {
    provider: 'B3',
    externalId: null,
    assetId: KCRE,
    targetAssetId: null,
    accountId: ACCOUNT,
    type: 'TRANSFER_IN',
    tradeDate: '2024-12-31',
    quantity: '120',
    targetQuantity: null,
    conversionRatio: null,
    conversionType: null,
    unitPrice: null,
    fees: null,
    amount: null,
    currency: 'BRL',
    fingerprint: 'fp-open',
    ...overrides,
  };
}

describe('Pre-baseline snapshot gate (generic, negotiation-safe)', () => {
  it('downgrades pre-baseline BUY covered by an opening snapshot and flags exception eligibility', () => {
    const [gated] = applyPreBaselineSnapshotGate({
      candidates: [buyCandidate()],
      existing: [openingRow()],
    });
    expect(gated!.status).toBe('NEEDS_REVIEW');
    expect(gated!.issues.some((i) => i.code === 'PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT')).toBe(
      true,
    );
    expect(gated!.unsettledExceptionEligible).toBe(true);
    expect(gated!.coveringSnapshotDate).toBe('2024-12-31');
    // Trade-date economics preserved: no date rewriting.
    expect(gated!.tradeDate).toBe('2024-12-27');
    expect(gated!.quantity).toBe('80');
    expect(gated!.unitPrice).toBe('8.45');
  });

  it('keeps the 26/12 KCRE11 120 leg covered (default state stays review)', () => {
    const [gated] = applyPreBaselineSnapshotGate({
      candidates: [
        buyCandidate({
          rowNumber: 62,
          tradeDate: '2024-12-26',
          quantity: '120',
          unitPrice: '8.50',
        }),
      ],
      existing: [openingRow()],
    });
    expect(gated!.status).toBe('NEEDS_REVIEW');
    // Eligible in mechanics (owner decides per-row with evidence); the 26/12
    // leg simply must never receive a resolution because it IS the snapshot.
    expect(gated!.unsettledExceptionEligible).toBe(true);
  });

  it('leaves post-baseline trades READY', () => {
    const [gated] = applyPreBaselineSnapshotGate({
      candidates: [buyCandidate({ tradeDate: '2025-01-24', quantity: '96', unitPrice: '7.99' })],
      existing: [openingRow()],
    });
    expect(gated!.status).toBe('READY');
    expect(gated!.unsettledExceptionEligible).toBeUndefined();
  });

  it('does not flag BONUS rows as exception-eligible (BUY/SELL only)', () => {
    const [gated] = applyPreBaselineSnapshotGate({
      candidates: [buyCandidate({ operation: 'BONUS', unitPrice: '0' })],
      existing: [openingRow()],
    });
    expect(gated!.status).toBe('NEEDS_REVIEW');
    expect(gated!.unsettledExceptionEligible).toBeUndefined();
  });

  it('does not flag non-B3 providers', () => {
    const [gated] = applyPreBaselineSnapshotGate({
      candidates: [buyCandidate({ provider: 'CSV' })],
      existing: [openingRow()],
    });
    expect(gated!.status).toBe('NEEDS_REVIEW');
    expect(gated!.unsettledExceptionEligible).toBeUndefined();
  });

  it('does not fire without a covering snapshot', () => {
    const [gated] = applyPreBaselineSnapshotGate({ candidates: [buyCandidate()], existing: [] });
    expect(gated!.status).toBe('READY');
  });
});

describe('verifyUnsettledTradeResolution (server-side)', () => {
  function gated(): ClassifiedCandidate {
    const [g] = applyPreBaselineSnapshotGate({
      candidates: [buyCandidate()],
      existing: [openingRow()],
    });
    return g!;
  }

  it('approves the KCRE11 27/12 shape and returns the baseline date', () => {
    const check = verifyUnsettledTradeResolution(gated());
    expect(check).toEqual({ eligible: true, baselineDate: '2024-12-31' });
  });

  it('rejects every forged or ineligible variant', () => {
    const base = gated();
    expect(verifyUnsettledTradeResolution({ ...base, operation: 'BONUS' }).eligible).toBe(false);
    expect(verifyUnsettledTradeResolution({ ...base, provider: 'CSV' }).eligible).toBe(false);
    expect(verifyUnsettledTradeResolution({ ...base, status: 'READY' }).eligible).toBe(false);
    expect(verifyUnsettledTradeResolution({ ...base, duplicate: 'CONFLICT' }).eligible).toBe(false);
    expect(verifyUnsettledTradeResolution({ ...base, assetId: null }).eligible).toBe(false);
    expect(
      verifyUnsettledTradeResolution({
        ...base,
        issues: [...base.issues, { code: 'TRANSFER_WITH_PRICE', message: 'x' }],
      }).eligible,
    ).toBe(false);
    expect(
      verifyUnsettledTradeResolution({ ...base, issues: [], coveringSnapshotDate: undefined })
        .eligible,
    ).toBe(false);
    // Resolution-only issues (e.g. a stale mapping flag alongside resolved
    // ids after overrides) do not block the exception.
    expect(
      verifyUnsettledTradeResolution({
        ...base,
        issues: [...base.issues, { code: 'UNKNOWN_ASSET', field: 'ticker', message: 'x' }],
      }),
    ).toEqual({ eligible: true, baselineDate: '2024-12-31' });
    expect(
      verifyUnsettledTradeResolution({
        ...base,
        accountId: null,
      }).eligible,
    ).toBe(false);
  });

  it('validates resolution metadata strictly', () => {
    expect(
      validateUnsettledResolutionMetadata({
        type: 'PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT',
        reason: 'Trade 27/12/2024 settled after 31/12/2024 B3 custody cutoff',
        declaredSettlementDate: '2025-01-02',
      }),
    ).toEqual({ valid: true });
    expect(validateUnsettledResolutionMetadata({ type: 'FORCE_IMPORT', reason: 'x' }).valid).toBe(
      false,
    );
    expect(
      validateUnsettledResolutionMetadata({
        type: 'PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT',
        reason: '  ',
      }).valid,
    ).toBe(false);
    expect(
      validateUnsettledResolutionMetadata({
        type: 'PRE_BASELINE_NOT_COVERED_BY_SNAPSHOT',
        reason: 'x',
        declaredSettlementDate: '02/01/2025',
      }).valid,
    ).toBe(false);
  });
});

describe('KCRE11 dedupe after hypothetical confirmation', () => {
  it('classifies the 27/12 leg as EXACT_DUPLICATE once persisted', () => {
    const assetMatch: AssetMatch = resolveAsset('KCRE11', [
      { id: KCRE, ticker: 'KCRE11', exchange: 'B3', status: 'ACTIVE' },
    ]);
    const accountMatch = resolveAccount('XP', [{ id: ACCOUNT, name: 'XP' }]);
    const fp = canonicalFingerprint({
      portfolioId: PORTFOLIO,
      accountId: ACCOUNT,
      assetId: KCRE,
      type: 'BUY',
      tradeDate: '2024-12-27',
      quantity: '80',
      unitPrice: '8.45',
      fees: '0',
      currency: 'BRL',
    });
    const out = classifyOne({
      portfolioId: PORTFOLIO,
      provider: 'B3',
      candidate: {
        rowNumber: 61,
        tradeDate: '2024-12-27',
        ticker: 'KCRE11',
        operation: 'BUY',
        rawOperation: 'Compra',
        quantity: '80',
        unitPrice: '8.45',
        fees: '0',
        currency: 'BRL',
        status: 'READY',
        issues: [],
      },
      assetMatch,
      accountMatch,
      defaultAccountId: null,
      existing: [
        openingRow(),
        {
          ...openingRow(),
          type: 'BUY',
          tradeDate: '2024-12-27',
          quantity: '80',
          unitPrice: '8.45',
          fees: '0',
          fingerprint: fp,
        },
      ],
    });
    expect(out.duplicate).toBe('EXACT_DUPLICATE');
    expect(out.status).toBe('DUPLICATE');
  });
});
