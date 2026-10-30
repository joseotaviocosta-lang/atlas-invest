import { describe, expect, it } from 'vitest';
import { getConfirmEligibility, getEffectiveRowState } from '@/lib/import-review';
import type { ReviewCandidateLike, ReviewDecision } from '@/lib/import-review';

function candidate(overrides: Partial<ReviewCandidateLike> = {}): ReviewCandidateLike {
  return {
    status: 'READY',
    issues: [],
    assetId: 'asset-1',
    accountId: 'account-1',
    duplicate: 'NEW',
    ...overrides,
  };
}

function decision(overrides: Partial<ReviewDecision> = {}): ReviewDecision {
  return { skipped: false, forceImport: false, ...overrides };
}

function eligibilityOf(rows: Array<{ candidate: ReviewCandidateLike; decision: ReviewDecision }>) {
  return getConfirmEligibility(rows);
}

describe('Import review decisions (Phase 5K-HV-R1)', () => {
  it('A: NEEDS_REVIEW row + Ignore stays skipped and never imports', () => {
    const unresolved: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      assetId: null,
      accountId: null,
      issues: [{ code: 'UNKNOWN_ASSET' }],
    });
    // Selective-confirmation hotfix: undecided review rows stay pending
    // (never blocked, never user-ignored).
    expect(getEffectiveRowState(unresolved, decision()).state).toBe('pending');
    expect(getEffectiveRowState(unresolved, decision({ skipped: true })).state).toBe('skipped');

    const eligibility = eligibilityOf([
      { candidate: unresolved, decision: decision({ skipped: true }) },
    ]);
    expect(eligibility.canConfirm).toBe(false);
    expect(eligibility.hint).toMatch(/Nenhuma operação será importada/);
  });

  it('B: unresolved account + valid account selection resolves the row', () => {
    const unresolved: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      assetId: 'asset-1',
      accountId: null,
      issues: [{ code: 'ACCOUNT_REQUIRED' }],
    });
    expect(
      getEffectiveRowState(unresolved, decision({ accountOverrideId: 'account-9' })).state,
    ).toBe('importable');
  });

  it('C: unresolved asset + asset override resolves the row', () => {
    const unresolved: ReviewCandidateLike = candidate({
      status: 'AMBIGUOUS_ASSET',
      assetId: null,
      accountId: 'account-1',
      issues: [{ code: 'AMBIGUOUS_ASSET' }],
    });
    expect(getEffectiveRowState(unresolved, decision({ assetOverrideId: 'asset-9' })).state).toBe(
      'importable',
    );
  });

  it('KCRE11: eligible pre-baseline row stays pending without resolution', () => {
    const gated: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      issues: [{ code: 'PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT' }],
      unsettledExceptionEligible: true,
    });
    expect(getEffectiveRowState(gated, decision()).state).toBe('pending');
  });

  it('KCRE11: eligible row + complete resolution becomes importable', () => {
    const gated: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      issues: [{ code: 'PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT' }],
      unsettledExceptionEligible: true,
    });
    const resolved = decision({
      resolution: {
        reason: 'Trade 27/12/2024 settled after 31/12/2024 cutoff',
        declaredSettlementDate: '2025-01-02',
      },
    });
    expect(getEffectiveRowState(gated, resolved).state).toBe('importable');
    const eligibility = eligibilityOf([{ candidate: gated, decision: resolved }]);
    expect(eligibility.canConfirm).toBe(true);
    expect(eligibility.importableCount).toBe(1);
  });

  it('KCRE11: incomplete resolution blocks until fixed or skipped', () => {
    const gated: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      issues: [{ code: 'PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT' }],
      unsettledExceptionEligible: true,
    });
    const bad = decision({ resolution: { reason: '  ' } });
    expect(getEffectiveRowState(gated, bad).state).toBe('blocked');
    // Ineligible rows never become importable via resolution.
    const plain: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      issues: [{ code: 'TRANSFER_WITH_PRICE' }],
    });
    expect(getEffectiveRowState(plain, decision({ resolution: { reason: 'x' } })).state).toBe(
      'pending',
    );
  });

  it('D: mixed 2 resolved + 3 ignored enables confirm', () => {
    const ready = candidate();
    const needsReview: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      assetId: null,
      accountId: null,
      issues: [{ code: 'UNKNOWN_ASSET' }],
    });
    const eligibility = eligibilityOf([
      { candidate: ready, decision: decision() },
      { candidate: ready, decision: decision() },
      { candidate: needsReview, decision: decision({ skipped: true }) },
      { candidate: needsReview, decision: decision({ skipped: true }) },
      { candidate: needsReview, decision: decision({ skipped: true }) },
    ]);
    expect(eligibility.canConfirm).toBe(true);
    expect(eligibility.importableCount).toBe(2);
    expect(eligibility.skippedCount).toBe(3);
    expect(eligibility.hint).toBeNull();
  });

  it('E: one undecided review row stays pending without blocking confirm', () => {
    const unresolved: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      assetId: null,
      accountId: null,
      issues: [{ code: 'ACCOUNT_REQUIRED' }],
    });
    const eligibility = eligibilityOf([
      { candidate: candidate(), decision: decision() },
      { candidate: unresolved, decision: decision() },
    ]);
    expect(eligibility.canConfirm).toBe(true);
    expect(eligibility.importableCount).toBe(1);
    expect(eligibility.pendingCount).toBe(1);
    expect(eligibility.blockedCount).toBe(0);
    expect(eligibility.hint).toMatch(/precisa de revisão e não será importado agora/);
  });

  it('F: all ignored rows disable confirm with explicit empty state', () => {
    const unresolved: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      assetId: null,
      accountId: null,
      issues: [{ code: 'UNKNOWN_ASSET' }],
    });
    const eligibility = eligibilityOf([
      { candidate: unresolved, decision: decision({ skipped: true }) },
      { candidate: unresolved, decision: decision({ skipped: true }) },
    ]);
    expect(eligibility.canConfirm).toBe(false);
    expect(eligibility.importableCount).toBe(0);
    expect(eligibility.hint).toMatch(/Nenhuma operação será importada/);
  });

  it('probable duplicates require explicit force-import; conflicts can only be skipped', () => {
    const probable: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      duplicate: 'PROBABLE_DUPLICATE',
      issues: [{ code: 'PROBABLE_DUPLICATE' }],
    });
    expect(getEffectiveRowState(probable, decision()).state).toBe('blocked');
    expect(getEffectiveRowState(probable, decision({ forceImport: true })).state).toBe(
      'importable',
    );

    const conflict: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      duplicate: 'CONFLICT',
      issues: [{ code: 'DUPLICATE_CONFLICT' }],
    });
    expect(getEffectiveRowState(conflict, decision({ forceImport: true })).state).toBe('blocked');
    expect(getEffectiveRowState(conflict, decision({ skipped: true })).state).toBe('skipped');
  });

  it('exact duplicates and unsupported rows never block', () => {
    const duplicate: ReviewCandidateLike = candidate({
      status: 'DUPLICATE',
      duplicate: 'EXACT_DUPLICATE',
      issues: [{ code: 'EXACT_DUPLICATE' }],
    });
    const unsupported: ReviewCandidateLike = candidate({
      status: 'UNSUPPORTED',
      issues: [{ code: 'UNSUPPORTED_OPERATION' }],
    });
    const eligibility = eligibilityOf([
      { candidate: candidate(), decision: decision() },
      { candidate: duplicate, decision: decision() },
      { candidate: unsupported, decision: decision() },
    ]);
    expect(eligibility.canConfirm).toBe(true);
    expect(eligibility.autoSkippedCount).toBe(2);
  });
});

describe('Selective READY confirmation (hotfix)', () => {
  it('READY + REVIEW + UNSUPPORTED enables confirm with pending warning', () => {
    const ready: ReviewCandidateLike = candidate();
    const review: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      issues: [{ code: 'TRANSFER_NEEDS_COUNTERPARTY' }],
    });
    const unsupported: ReviewCandidateLike = candidate({
      status: 'UNSUPPORTED',
      issues: [{ code: 'LOAN_CUSTODY_STATE' }],
    });
    const eligibility = eligibilityOf([
      { candidate: ready, decision: decision() },
      { candidate: review, decision: decision() },
      { candidate: unsupported, decision: decision() },
    ]);
    expect(eligibility.canConfirm).toBe(true);
    expect(eligibility.importableCount).toBe(1);
    expect(eligibility.pendingCount).toBe(1);
    expect(eligibility.autoSkippedCount).toBe(1);
    expect(eligibility.hint).toMatch(/1 item precisa de revisão e não será importado agora/);
  });

  it('0 READY + REVIEW keeps confirmation disabled', () => {
    const review: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      issues: [{ code: 'UNMATCHED_PRICED_SETTLEMENT' }],
    });
    const eligibility = eligibilityOf([{ candidate: review, decision: decision() }]);
    expect(eligibility.canConfirm).toBe(false);
    expect(eligibility.importableCount).toBe(0);
    expect(eligibility.pendingCount).toBe(1);
    expect(eligibility.hint).toMatch(/Nenhuma operação será importada/);
  });

  it('manually ignored READY decreases willImport; resolved REVIEW joins it', () => {
    const skippedReady: ReviewCandidateLike = candidate();
    const resolvable: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      assetId: null,
      accountId: 'account-1',
      issues: [{ code: 'UNKNOWN_ASSET' }],
    });
    const eligibility = eligibilityOf([
      { candidate: skippedReady, decision: decision({ skipped: true }) },
      {
        candidate: resolvable,
        decision: decision({ assetOverrideId: 'asset-9' }),
      },
    ]);
    expect(eligibility.canConfirm).toBe(true);
    expect(eligibility.importableCount).toBe(1);
    expect(eligibility.skippedCount).toBe(1);
    expect(eligibility.pendingCount).toBe(0);
  });

  it('pending review is never counted as user-ignored', () => {
    const review: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      issues: [{ code: 'PRE_BASELINE_COVERED_BY_OPENING_SNAPSHOT' }],
    });
    const eligibility = eligibilityOf([
      { candidate: candidate(), decision: decision() },
      { candidate: review, decision: decision() },
    ]);
    expect(eligibility.skippedCount).toBe(0);
    expect(eligibility.pendingCount).toBe(1);
  });

  it('invalid and conflict rows still block confirmation', () => {
    const invalid: ReviewCandidateLike = candidate({
      status: 'INVALID',
      issues: [{ code: 'INVALID_DATE' }],
    });
    const eligibility = eligibilityOf([
      { candidate: candidate(), decision: decision() },
      { candidate: invalid, decision: decision() },
    ]);
    expect(eligibility.canConfirm).toBe(false);
    expect(eligibility.blockedCount).toBe(1);
    expect(eligibility.hint).toMatch(/Resolva ou ignore/);
  });
});

describe('Pending review counter consistency (hotfix)', () => {
  const ready = (): ReviewCandidateLike => candidate();
  const review = (): ReviewCandidateLike =>
    candidate({ status: 'NEEDS_REVIEW', issues: [{ code: 'TRANSFER_NEEDS_COUNTERPARTY' }] });
  const unsupported = (): ReviewCandidateLike =>
    candidate({ status: 'UNSUPPORTED', issues: [{ code: 'LOAN_CUSTODY_STATE' }] });

  it('8 READY + 45 REVIEW + 127 UNSUPPORTED → willImport 8, pending 45, auto 127', () => {
    const rows = [
      ...Array.from({ length: 8 }, () => ({ candidate: ready(), decision: decision() })),
      ...Array.from({ length: 45 }, () => ({ candidate: review(), decision: decision() })),
      ...Array.from({ length: 127 }, () => ({ candidate: unsupported(), decision: decision() })),
    ];
    const eligibility = eligibilityOf(rows);
    expect(eligibility.importableCount).toBe(8);
    expect(eligibility.pendingCount).toBe(45);
    expect(eligibility.autoSkippedCount).toBe(127);
    expect(eligibility.skippedCount).toBe(0);
    expect(eligibility.blockedCount).toBe(0);
    expect(eligibility.canConfirm).toBe(true);
  });

  it('0 READY + 45 REVIEW → pending 45, confirmation disabled', () => {
    const rows = Array.from({ length: 45 }, () => ({
      candidate: review(),
      decision: decision(),
    }));
    const eligibility = eligibilityOf(rows);
    expect(eligibility.importableCount).toBe(0);
    expect(eligibility.pendingCount).toBe(45);
    expect(eligibility.canConfirm).toBe(false);
    expect(eligibility.hint).toMatch(/Nenhuma operação será importada/);
  });

  it('8 READY + 0 REVIEW → pending 0, confirmation enabled', () => {
    const rows = Array.from({ length: 8 }, () => ({
      candidate: ready(),
      decision: decision(),
    }));
    const eligibility = eligibilityOf(rows);
    expect(eligibility.importableCount).toBe(8);
    expect(eligibility.pendingCount).toBe(0);
    expect(eligibility.canConfirm).toBe(true);
    expect(eligibility.hint).toBeNull();
  });

  it('resolving 1 of 45 REVIEW rows moves it from pending to importable', () => {
    const resolvable: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      assetId: null,
      accountId: 'account-1',
      issues: [{ code: 'UNKNOWN_ASSET' }],
    });
    const rows = [
      ...Array.from({ length: 8 }, () => ({ candidate: ready(), decision: decision() })),
      ...Array.from({ length: 44 }, () => ({ candidate: review(), decision: decision() })),
      {
        candidate: resolvable,
        decision: decision({ assetOverrideId: 'asset-9' }),
      },
    ];
    const eligibility = eligibilityOf(rows);
    expect(eligibility.importableCount).toBe(9);
    expect(eligibility.pendingCount).toBe(44);
    expect(eligibility.canConfirm).toBe(true);
  });

  it('ignoring 1 of 8 READY decreases willImport without touching pending', () => {
    const rows = [
      ...Array.from({ length: 7 }, () => ({ candidate: ready(), decision: decision() })),
      { candidate: ready(), decision: decision({ skipped: true }) },
      ...Array.from({ length: 45 }, () => ({ candidate: review(), decision: decision() })),
    ];
    const eligibility = eligibilityOf(rows);
    expect(eligibility.importableCount).toBe(7);
    expect(eligibility.skippedCount).toBe(1);
    expect(eligibility.pendingCount).toBe(45);
    expect(eligibility.canConfirm).toBe(true);
  });
});
