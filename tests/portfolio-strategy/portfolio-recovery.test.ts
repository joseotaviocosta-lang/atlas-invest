import { describe, expect, it } from 'vitest';
import {
  deriveOperationalRecovery,
  summarizeOperationalRecovery,
  INTERRUPTED_RUN_TIMEOUT_MS,
  type OperationalRecoveryRunInput,
} from '@atlas/portfolio-strategy';

describe('Phase 5S-F: Operational Reliability & Recovery Derivation', () => {
  const baseTime = new Date('2026-10-28T12:00:00.000Z');

  function makeRun(overrides: Partial<OperationalRecoveryRunInput>): OperationalRecoveryRunInput {
    return {
      id: 'run-1',
      portfolioId: 'portfolio-1',
      source: 'B3',
      status: 'COMPLETED',
      startedAt: new Date(baseTime.getTime() - 5 * 60 * 1000), // 5 min ago
      ...overrides,
    };
  }

  it('classifies COMPLETED run as NONE (no recovery needed)', () => {
    const recovery = deriveOperationalRecovery(makeRun({ status: 'COMPLETED' }), baseTime);
    expect(recovery.recoveryState).toBe('NONE');
    expect(recovery.recommendedAction).toBe('NONE');
    expect(recovery.canRetry).toBe(false);
    expect(recovery.canResume).toBe(false);
    expect(recovery.requiresReview).toBe(false);
  });

  it('classifies AWAITING_REVIEW as REVIEW_REQUIRED, never stale regardless of age (T3/T10: canResume=false)', () => {
    // 3 days old awaiting review
    const oldStarted = new Date(baseTime.getTime() - 3 * 24 * 60 * 60 * 1000);
    const recovery = deriveOperationalRecovery(
      makeRun({ status: 'AWAITING_REVIEW', startedAt: oldStarted }),
      baseTime,
    );
    expect(recovery.recoveryState).toBe('REVIEW_REQUIRED');
    expect(recovery.recommendedAction).toBe('VIEW_REVIEW');
    expect(recovery.canRetry).toBe(false);
    expect(recovery.canResume).toBe(false);
    expect(recovery.requiresReview).toBe(true);
  });

  it('classifies fresh STARTED run as in-flight (NONE) (T1)', () => {
    const freshStarted = new Date(baseTime.getTime() - 2 * 60 * 1000); // 2 min ago
    const recovery = deriveOperationalRecovery(
      makeRun({ status: 'STARTED', startedAt: freshStarted }),
      baseTime,
    );
    expect(recovery.recoveryState).toBe('NONE');
    expect(recovery.recommendedAction).toBe('NONE');
    expect(recovery.canRetry).toBe(false);
  });

  it('classifies old STARTED B3 run as INTERRUPTED and RETRY_AVAILABLE (T2)', () => {
    const oldStarted = new Date(baseTime.getTime() - (INTERRUPTED_RUN_TIMEOUT_MS + 60 * 1000));
    const recovery = deriveOperationalRecovery(
      makeRun({ source: 'B3', status: 'STARTED', startedAt: oldStarted }),
      baseTime,
    );
    expect(recovery.recoveryState).toBe('INTERRUPTED');
    expect(recovery.recommendedAction).toBe('RETRY');
    expect(recovery.canRetry).toBe(true);
    expect(recovery.canResume).toBe(false);
  });

  it('classifies old STARTED CSV run as INTERRUPTED but requires file re-import (not background retry)', () => {
    const oldStarted = new Date(baseTime.getTime() - (INTERRUPTED_RUN_TIMEOUT_MS + 60 * 1000));
    const recovery = deriveOperationalRecovery(
      makeRun({ source: 'CSV', status: 'STARTED', startedAt: oldStarted }),
      baseTime,
    );
    expect(recovery.recoveryState).toBe('INTERRUPTED');
    expect(recovery.recommendedAction).toBe('VIEW_IMPORT');
    expect(recovery.canRetry).toBe(false);
  });

  it('does NOT mark CONFIRMING run as interrupted even after long review (T4: CONFIRMING_STALE_DETECTION_UNSUPPORTED)', () => {
    // Run started 2 hours ago (user deliberated on review), entered CONFIRMING moments ago
    const oldStarted = new Date(baseTime.getTime() - 2 * 60 * 60 * 1000);
    const recovery = deriveOperationalRecovery(
      makeRun({ source: 'B3', status: 'CONFIRMING', startedAt: oldStarted }),
      baseTime,
    );
    // Must NOT be interrupted based on startedAt!
    expect(recovery.recoveryState).toBe('NONE');
    expect(recovery.recommendedAction).toBe('NONE');
    expect(recovery.canRetry).toBe(false);
  });

  it('classifies PARTIAL run as terminal with VIEW_RUN action (T9: no false review inbox link)', () => {
    const recovery = deriveOperationalRecovery(
      makeRun({ status: 'PARTIAL', partial: true }),
      baseTime,
    );
    expect(recovery.recoveryState).toBe('NONE');
    expect(recovery.recommendedAction).toBe('VIEW_RUN');
    expect(recovery.canRetry).toBe(false);
    expect(recovery.requiresReview).toBe(false);
  });

  it('classifies transient FAILED run as RETRY_AVAILABLE', () => {
    const recovery = deriveOperationalRecovery(
      makeRun({
        status: 'FAILED',
        errorCode: 'INTEGRATION.SCHEDULED_SYNC_FAILED',
        errorMessage: 'Network timeout',
      }),
      baseTime,
    );
    expect(recovery.recoveryState).toBe('RETRY_AVAILABLE');
    expect(recovery.recommendedAction).toBe('RETRY');
    expect(recovery.canRetry).toBe(true);
  });

  it('classifies blocked FAILED run as BLOCKED (not automatically retryable)', () => {
    const blockedRecovery = deriveOperationalRecovery(
      makeRun({
        status: 'FAILED',
        errorCode: 'INTEGRATION.SCHEDULED_SOURCE_BLOCKED',
        errorMessage: 'Fonte bloqueada',
      }),
      baseTime,
    );
    expect(blockedRecovery.recoveryState).toBe('BLOCKED');
    expect(blockedRecovery.recommendedAction).toBe('VIEW_RUN');
    expect(blockedRecovery.canRetry).toBe(false);

    const noAccountRecovery = deriveOperationalRecovery(
      makeRun({
        status: 'FAILED',
        errorCode: 'INTEGRATION.SCHEDULED_NO_ACCOUNT',
        errorMessage: 'Sem conta',
      }),
      baseTime,
    );
    expect(noAccountRecovery.recoveryState).toBe('BLOCKED');
    expect(noAccountRecovery.canRetry).toBe(false);
  });

  it('classifies unsupported FAILED run as UNSUPPORTED', () => {
    const recovery = deriveOperationalRecovery(
      makeRun({
        status: 'FAILED',
        errorCode: 'INTEGRATION.UNSUPPORTED_SCHEDULED_SOURCE',
        errorMessage: 'Fonte desconhecida',
      }),
      baseTime,
    );
    expect(recovery.recoveryState).toBe('UNSUPPORTED');
    expect(recovery.recommendedAction).toBe('VIEW_RUN');
    expect(recovery.canRetry).toBe(false);
  });

  it('classifies unknown error code conservatively as BLOCKED with no-retry (T13)', () => {
    const recovery = deriveOperationalRecovery(
      makeRun({
        status: 'FAILED',
        errorCode: 'UNEXPECTED_SYSTEM_FAULT',
        errorMessage: 'Something broke unexpectedly',
      }),
      baseTime,
    );
    expect(recovery.recoveryState).toBe('BLOCKED');
    expect(recovery.recommendedAction).toBe('VIEW_RUN');
    expect(recovery.canRetry).toBe(false);
  });

  it('summarizeOperationalRecovery accurately aggregates counts across run window', () => {
    const interruptedStarted = new Date(baseTime.getTime() - 30 * 60 * 1000);
    const summary = summarizeOperationalRecovery(
      [
        makeRun({ id: 'r1', status: 'COMPLETED' }),
        makeRun({ id: 'r2', status: 'AWAITING_REVIEW' }),
        makeRun({ id: 'r3', status: 'STARTED', startedAt: interruptedStarted }),
        makeRun({ id: 'r4', status: 'FAILED', errorCode: 'INTEGRATION.SCHEDULED_SYNC_FAILED' }),
        makeRun({ id: 'r5', status: 'FAILED', errorCode: 'INTEGRATION.SCHEDULED_SOURCE_BLOCKED' }),
        makeRun({ id: 'r6', status: 'PARTIAL' }),
      ],
      baseTime,
    );

    expect(summary.interruptedCount).toBe(1);
    expect(summary.retryableCount).toBe(2); // r3 (interrupted B3) + r4 (transient failed)
    expect(summary.reviewRequiredCount).toBe(1); // r2 (awaiting review; r6 partial is terminal)
    expect(summary.items).toHaveLength(4); // r1 and r6 are NONE, so 4 items
  });
});

