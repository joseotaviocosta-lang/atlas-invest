import { describe, expect, it } from 'vitest';
import { buildAttentionEvents, deriveReviewItems, type ReviewRunInput } from '@atlas/import-engine';

/**
 * Phase 5P-B — review inbox derivation (pure).
 *
 * Deterministic projection of runs into actionable items: awaiting-review
 * with attention reasons, unsuperseded failures; clean terminal runs and
 * reason-free reviews never pollute the inbox.
 */
describe('Phase 5P-B: review inbox derivation', () => {
  function run(overrides: Partial<ReviewRunInput>): ReviewRunInput {
    return {
      id: 'run-1',
      portfolioId: 'p1',
      source: 'B3',
      trigger: 'SCHEDULED',
      status: 'AWAITING_REVIEW',
      newCandidates: 0,
      exactDuplicates: 0,
      probableDuplicates: 0,
      conflicts: 0,
      unsupported: 0,
      invalid: 0,
      partial: false,
      reconciliation: null,
      createdAt: '2026-10-22T08:00:00.000Z',
      ...overrides,
    };
  }

  it('awaiting review with new records produces a REVIEW item', () => {
    const [item] = deriveReviewItems([run({ id: 'a', newCandidates: 5 })]);
    expect(item).toMatchObject({
      runId: 'a',
      severity: 'REVIEW',
      reasonCodes: ['NEW_RECORDS'],
    });
  });

  it('clean completed runs and reason-free reviews produce no items', () => {
    expect(
      deriveReviewItems([
        run({ id: 'done', status: 'COMPLETED' }),
        run({ id: 'part', status: 'PARTIAL' }),
        run({ id: 'started', status: 'STARTED' }),
        run({ id: 'confirming', status: 'CONFIRMING' }),
        run({ id: 'quiet', newCandidates: 0, exactDuplicates: 9 }),
      ]),
    ).toEqual([]);
  });

  it('matched-only reconciliation never creates an item', () => {
    expect(
      deriveReviewItems([
        run({
          id: 'm',
          newCandidates: 0,
          reconciliation: {
            matched: 3,
            divergent: 0,
            missingLocal: 0,
            missingSource: 0,
            unresolved: 0,
          },
        }),
      ]),
    ).toEqual([]);
  });

  it('probable duplicates warn; conflicts outrank them', () => {
    const items = deriveReviewItems([
      run({
        id: 'dup',
        newCandidates: 0,
        probableDuplicates: 2,
        createdAt: '2026-10-22T09:00:00.000Z',
      }),
      run({ id: 'conf', conflicts: 1, createdAt: '2026-10-22T09:00:00.000Z' }),
    ]);
    expect(items.map((item) => item.runId)).toEqual(['conf', 'dup']);
    expect(items[0]).toMatchObject({
      severity: 'WARNING',
      reasonCodes: expect.arrayContaining(['CONFLICT']),
    });
    expect(items[1]).toMatchObject({
      severity: 'WARNING',
      reasonCodes: ['PROBABLE_DUPLICATE'],
    });
  });

  it('unsupported, partial and reconciliation divergences warn with stable codes', () => {
    const items = deriveReviewItems([
      run({
        id: 'u',
        unsupported: 1,
        partial: true,
        reconciliation: {
          matched: 1,
          divergent: 1,
          missingLocal: 2,
          missingSource: 3,
          unresolved: 4,
        },
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.severity).toBe('WARNING');
    expect(items[0]!.reasonCodes).toEqual([
      'UNSUPPORTED_RECORD',
      'PARTIAL_SYNC',
      'POSITION_DIVERGENCE',
      'MISSING_LOCAL_POSITION',
      'MISSING_SOURCE_POSITION',
      'UNRESOLVED_POSITION',
    ]);
  });

  it('failed runs surface as errors until a newer execution exists', () => {
    const failed = run({ id: 'f1', status: 'FAILED', createdAt: '2026-10-22T08:00:00.000Z' });
    expect(deriveReviewItems([failed])[0]).toMatchObject({
      severity: 'ERROR',
      reasonCodes: ['SYNC_FAILED'],
    });
    // A newer started execution already supersedes the old failure.
    const superseded = deriveReviewItems([
      failed,
      run({ id: 'f2', status: 'STARTED', createdAt: '2026-10-22T09:00:00.000Z' }),
    ]);
    expect(superseded).toEqual([]);
    // A newer failure becomes the actionable one; the old stays in history.
    const rot = deriveReviewItems([
      failed,
      run({ id: 'f3', status: 'FAILED', createdAt: '2026-10-22T10:00:00.000Z' }),
    ]);
    expect(rot.map((item) => item.runId)).toEqual(['f3']);
    // Recovery in another portfolio does not suppress this failure.
    const other = deriveReviewItems([
      failed,
      run({
        id: 'ok',
        portfolioId: 'p2',
        status: 'COMPLETED',
        createdAt: '2026-10-22T10:00:00.000Z',
      }),
    ]);
    expect(other.map((item) => item.runId)).toEqual(['f1']);
  });

  it('a failure with newer awaiting-review runs is superseded by the newer situation', () => {
    const items = deriveReviewItems([
      run({ id: 'err', status: 'FAILED', createdAt: '2026-10-22T08:00:00.000Z' }),
      run({ id: 'warn', probableDuplicates: 1, createdAt: '2026-10-22T09:00:00.000Z' }),
      run({ id: 'review', newCandidates: 1, createdAt: '2026-10-22T10:00:00.000Z' }),
    ]);
    expect(items.map((item) => item.runId)).toEqual(['warn', 'review']);
  });

  it('orders by severity, then blocking reasons, then recency', () => {
    const items = deriveReviewItems([
      run({ id: 'review', newCandidates: 1, createdAt: '2026-10-22T10:00:00.000Z' }),
      run({ id: 'warn', probableDuplicates: 1, createdAt: '2026-10-22T09:00:00.000Z' }),
      run({ id: 'err', status: 'FAILED', createdAt: '2026-10-22T11:00:00.000Z' }),
    ]);
    expect(items.map((item) => item.runId)).toEqual(['err', 'warn', 'review']);
  });

  it('builds versioned attention events without any transport', () => {
    const items = deriveReviewItems([
      run({ id: 'a', newCandidates: 2 }),
      run({ id: 'b', status: 'FAILED' }),
    ]);
    const events = buildAttentionEvents(items);
    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(event).toMatchObject({
        version: '1',
        type: 'INTEGRATION_REVIEW_REQUIRED',
        portfolioId: 'p1',
      });
      expect(typeof event.occurredAt).toBe('string');
    }
    expect(events.map((event) => event.summaryCode).sort()).toEqual(['NEW_RECORDS', 'SYNC_FAILED']);
  });
});
