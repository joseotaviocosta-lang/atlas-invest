import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_GAP_MATERIAL_PP_BP,
  SINGLE_ASSET_CONCENTRATION_BP,
  VALUATION_COVERAGE_ATTENTION_BP,
  VALUATION_COVERAGE_LOW_BP,
  isPositiveAmountString,
  percentStringToBasisPoints,
} from '@atlas/portfolio-review';

/**
 * Phase 5Q-A — policy unit tests (pure).
 *
 * Thresholds are centralized here, compared as integer basis points
 * parsed from decimal strings (no binary floats), and documented as
 * attention heuristics — never financial advice.
 */
describe('Phase 5Q-A: review policy', () => {
  it('centralizes thresholds with documented meaning', () => {
    expect(VALUATION_COVERAGE_ATTENTION_BP).toBe(10000);
    expect(VALUATION_COVERAGE_LOW_BP).toBe(8000);
    expect(SINGLE_ASSET_CONCENTRATION_BP).toBe(2500);
    expect(BENCHMARK_GAP_MATERIAL_PP_BP).toBe(-200);
  });

  it('parses percent strings to basis points without floats', () => {
    expect(percentStringToBasisPoints('100')).toBe(10000);
    expect(percentStringToBasisPoints('31.42')).toBe(3142);
    expect(percentStringToBasisPoints('25')).toBe(2500);
    expect(percentStringToBasisPoints('25.00')).toBe(2500);
    expect(percentStringToBasisPoints('-4.20')).toBe(-420);
    expect(percentStringToBasisPoints('-4.2')).toBe(-420);
    expect(percentStringToBasisPoints('0')).toBe(0);
    expect(percentStringToBasisPoints('87.40')).toBe(8740);
    expect(percentStringToBasisPoints('87.4')).toBe(8740);
    expect(percentStringToBasisPoints('87.456')).toBe(8745);
    expect(percentStringToBasisPoints('.5')).toBe(50);
    expect(percentStringToBasisPoints(' 30 ')).toBe(3000);
  });

  it('returns null for anything unparseable (fail closed)', () => {
    for (const invalid of [null, undefined, '', '   ', 'N/A', 'abc', '12.3.4', '--5', '%', 'NaN']) {
      expect(percentStringToBasisPoints(invalid as never)).toBeNull();
    }
  });

  it('detects strictly positive money amounts from strings', () => {
    expect(isPositiveAmountString('150.50')).toBe(true);
    expect(isPositiveAmountString('0.01')).toBe(true);
    expect(isPositiveAmountString('0')).toBe(false);
    expect(isPositiveAmountString('0.00')).toBe(false);
    expect(isPositiveAmountString('-10')).toBe(false);
    expect(isPositiveAmountString(null)).toBe(false);
    expect(isPositiveAmountString(undefined)).toBe(false);
    expect(isPositiveAmountString('')).toBe(false);
    expect(isPositiveAmountString('abc')).toBe(false);
  });
});
