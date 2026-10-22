import { describe, expect, it } from 'vitest';
import {
  assertRunUpdatable,
  isTerminalRunStatus,
  summarizeRunCandidates,
  InvalidRunTransitionError,
  type ClassifiedCandidate,
} from '@atlas/import-engine';

/**
 * Phase 5P-PRE — canonical integration-run contract (pure).
 *
 * Counts split duplicates by kind (never collapsed), terminal runs reject
 * every mutation fail-closed.
 */
describe('Phase 5P-PRE: integration run contract', () => {
  function candidate(overrides: Partial<ClassifiedCandidate>): ClassifiedCandidate {
    return {
      rowNumber: 2,
      tradeDate: '2026-03-10',
      ticker: 'PETR4',
      operation: 'BUY',
      rawOperation: 'COMPRA',
      quantity: '100',
      unitPrice: '30.00',
      fees: '0',
      currency: 'BRL',
      status: 'READY',
      issues: [],
      assetId: 'asset-1',
      assetResolution: 'RESOLVED',
      accountId: 'account-1',
      accountResolution: 'RESOLVED',
      fingerprint: 'f'.repeat(64),
      duplicate: 'NEW',
      provider: 'B3',
      ...overrides,
    } as ClassifiedCandidate;
  }

  it('summarizes preview counts without collapsing duplicate kinds', () => {
    const summary = summarizeRunCandidates({
      recordsFetched: 7,
      candidates: [
        candidate({}),
        candidate({ rowNumber: 3, status: 'DUPLICATE', duplicate: 'EXACT_DUPLICATE' }),
        candidate({
          rowNumber: 4,
          status: 'NEEDS_REVIEW',
          duplicate: 'PROBABLE_DUPLICATE',
        }),
        candidate({ rowNumber: 5, status: 'NEEDS_REVIEW', duplicate: 'CONFLICT' }),
        candidate({ rowNumber: 6, status: 'UNSUPPORTED' }),
        candidate({ rowNumber: 7, status: 'INVALID' }),
      ],
    });
    expect(summary).toEqual({
      recordsFetched: 7,
      recordsNormalized: 6,
      newCandidates: 1,
      exactDuplicates: 1,
      probableDuplicates: 1,
      conflicts: 1,
      unsupported: 1,
      invalid: 1,
    });
  });

  it('terminal runs reject every mutation with a stable code', () => {
    expect(isTerminalRunStatus('COMPLETED')).toBe(true);
    expect(isTerminalRunStatus('PARTIAL')).toBe(true);
    expect(isTerminalRunStatus('FAILED')).toBe(true);
    expect(isTerminalRunStatus('STARTED')).toBe(false);
    expect(isTerminalRunStatus('AWAITING_REVIEW')).toBe(false);
    expect(isTerminalRunStatus('CONFIRMING')).toBe(false);
    for (const status of ['COMPLETED', 'PARTIAL', 'FAILED'] as const) {
      expect(() => assertRunUpdatable(status, 'confirmation')).toThrow(InvalidRunTransitionError);
      try {
        assertRunUpdatable(status, 'confirmation');
        expect.unreachable();
      } catch (error) {
        expect((error as InvalidRunTransitionError).code).toBe('IMPORT.INVALID_RUN_TRANSITION');
      }
    }
    expect(() => assertRunUpdatable('AWAITING_REVIEW', 'confirmation')).not.toThrow();
    expect(() => assertRunUpdatable('STARTED', 'preview')).not.toThrow();
  });
});
