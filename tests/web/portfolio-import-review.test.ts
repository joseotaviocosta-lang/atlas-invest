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
  it('A: NEEDS_REVIEW row + Ignore no longer blocks', () => {
    const unresolved: ReviewCandidateLike = candidate({
      status: 'NEEDS_REVIEW',
      assetId: null,
      accountId: null,
      issues: [{ code: 'UNKNOWN_ASSET' }],
    });
    expect(getEffectiveRowState(unresolved, decision()).state).toBe('blocked');
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

  it('E: one undecided row blocks confirm', () => {
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
    expect(eligibility.canConfirm).toBe(false);
    expect(eligibility.blockedCount).toBe(1);
    expect(eligibility.hint).toMatch(/Resolva ou ignore/);
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
