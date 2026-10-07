import { describe, it, expect } from 'vitest';
import type { HighIncomeReviewPackage } from '@atlas/tax-engine';
import type { RawHighIncomeReviewPackage } from '@atlas/ui';

/**
 * Phase 4I.6 — Anti-drift guard.
 *
 * The authoritative serialized package type lives in `@atlas/tax-engine`
 * (`HighIncomeReviewPackage`); `@atlas/ui` carries a hand-maintained MIRROR
 * (`RawHighIncomeReviewPackage`) with no cross-package import. If the two ever
 * diverge structurally, these compile-time assignability checks fail to type
 * check and the suite does not build.
 */
describe('Phase 4I.6 — High-income review package UI mirror assignability', () => {
  it('engine HighIncomeReviewPackage is assignable to the @atlas/ui mirror and back', () => {
    // Compile-time assignability both directions (structural identity).
    const _engineToMirror: RawHighIncomeReviewPackage = {} as HighIncomeReviewPackage;
    const _mirrorToEngine: HighIncomeReviewPackage = {} as RawHighIncomeReviewPackage;
    void _engineToMirror;
    void _mirrorToEngine;
    expect(true).toBe(true);
  });
});
