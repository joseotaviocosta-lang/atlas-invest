import { describe, it, expect } from 'vitest';
import {
  programInvariants,
  generateFuzzCase,
  generateRandomDates,
  type InvariantState,
} from '../../packages/tax-engine/src/hardening/invariants';
import {
  programProperties,
  runProgramFuzz,
  runDifferentialTests,
  runConcurrencyStress,
  runPropertyTest,
} from '../../packages/tax-engine/src/hardening/properties';

describe('Phase 4K.6 — Hardening Invariants & Integrated Properties Suite', () => {
  describe('Invariants I1–I25 (Unit Validation)', () => {
    it('verifies that all 25 invariants exist and return PropertyTestResult', () => {
      expect(programInvariants.length).toBe(25);

      const baseState = generateFuzzCase('MONTHLY');

      for (let i = 0; i < programInvariants.length; i++) {
        const inv = programInvariants[i];
        expect(typeof inv).toBe('function');
        const res = inv!(baseState, {
          expectedFingerprint: baseState.sourceFingerprint,
          previousSource: 'different-source',
        });
        expect(typeof res.pass).toBe('boolean');
        expect(typeof res.reason).toBe('string');
        expect(res.pass).toBe(true);
      }
    });

    it('verifies generateRandomDates produces valid civil date strings', () => {
      const dates = generateRandomDates(5);
      expect(dates.length).toBe(5);
      for (const d of dates) {
        expect(/^\d{4}-\d{2}-\d{2}$/.test(d)).toBe(true);
      }
    });
  });

  describe('Properties P1–P15 (Integrated Program Properties)', () => {
    it('verifies all 15 program properties pass without failure', () => {
      expect(programProperties.length).toBe(15);

      const context = {
        expectedFingerprint: 'fp-test-01',
        generateState: (): InvariantState => ({
          sourceFingerprint: 'fp-test-01',
        }),
      };

      for (let i = 0; i < programProperties.length; i++) {
        const prop = programProperties[i];
        expect(typeof prop).toBe('function');
        const res = prop!({}, context);
        expect(res.pass).toBe(true);
        expect(typeof res.reason).toBe('string');
      }
    });

    it('verifies runPropertyTest runner with iteration passes', () => {
      const context = {
        expectedFingerprint: 'fp-pass',
        generateState: (): InvariantState => ({ sourceFingerprint: 'fp-pass' }),
      };
      const testFn = (s: InvariantState, c?: typeof context) => ({
        pass: s.sourceFingerprint === c?.expectedFingerprint,
        reason: 'fingerprint match',
      });
      const summary = runPropertyTest(testFn, context, 5);
      expect(summary.pass).toBe(true);
      expect(summary.failures).toBe(0);
    });
  });

  describe('Concurrency Hardening C1–C12', () => {
    it('runs concurrency stress across all scenarios without invariant failure', () => {
      // Scenarios representing concurrency scenarios across invariants
      const scenarios = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      const stressResult = runConcurrencyStress(scenarios, 50);

      expect(stressResult.total).toBe(12 * 50);
      expect(stressResult.failures).toBe(0);
      expect(stressResult.passed).toBe(stressResult.total);
    });
  });

  describe('Seeded Program Fuzz (>= 20,000 cases)', () => {
    it('executes 20,000 randomized fuzz cases with 0 invariant failures', () => {
      const fuzzResult = runProgramFuzz(20000, 20261012);

      expect(fuzzResult.total).toBe(20000);
      expect(fuzzResult.failures).toBe(0);
      expect(fuzzResult.passed).toBe(20000);
    });
  });

  describe('Differential Tests (20,000 cases)', () => {
    it('runs 20,000 differential cases verifying cross-module consistency', () => {
      const diffResult = runDifferentialTests(20000);

      expect(diffResult.total).toBe(20000);
      expect(diffResult.mismatches).toBe(0);
      expect(diffResult.passed).toBe(20000);
    });
  });
});
