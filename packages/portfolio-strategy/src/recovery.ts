/**
 * Phase 5S-F — operational reliability and recovery derivation (pure, zero I/O).
 *
 * Evaluates the factual state of an IntegrationRun or background sync attempt,
 * determining if it was interrupted, requires review, is retryable, or is blocked.
 * Does not mutate records, fabricate history, or guess without persisted proof.
 */

export const INTERRUPTED_RUN_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export const OPERATIONAL_RECOVERY_STATES = [
  'NONE',
  'RETRY_AVAILABLE',
  'REVIEW_REQUIRED',
  'INTERRUPTED',
  'BLOCKED',
  'UNSUPPORTED',
] as const;
export type OperationalRecoveryState = (typeof OPERATIONAL_RECOVERY_STATES)[number];

export const OPERATIONAL_RECOVERY_ACTIONS = [
  'NONE',
  'RETRY',
  'VIEW_REVIEW',
  'VIEW_RUN',
  'VIEW_IMPORT',
] as const;
export type OperationalRecoveryAction = (typeof OPERATIONAL_RECOVERY_ACTIONS)[number];

export interface OperationalRecoveryRunInput {
  id: string;
  portfolioId: string;
  source: string;
  status: string;
  trigger?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt: Date;
  completedAt?: Date | null;
  partial?: boolean;
}

export interface OperationalRecovery {
  runId: string;
  portfolioId: string;
  source: string;
  status: string;
  recoveryState: OperationalRecoveryState;
  recommendedAction: OperationalRecoveryAction;
  canRetry: boolean;
  canResume: boolean;
  requiresReview: boolean;
  reason: string;
}

export interface OperationalRecoverySummary {
  interruptedCount: number;
  retryableCount: number;
  reviewRequiredCount: number;
  items: OperationalRecovery[];
}

/**
 * Pure classification of run operational reliability and recovery.
 *
 * Rules:
 * - COMPLETED: terminal success, no recovery needed.
 * - AWAITING_REVIEW: human-wait state, indefinite duration, never stale; requires review.
 * - STARTED / CONFIRMING:
 *     - If age exceeds INTERRUPTED_RUN_TIMEOUT_MS: interrupted run.
 *         - B3 source: retry available (starts clean new run).
 *         - CSV source: user must re-import file (file payload not persisted server-side).
 *     - Otherwise: in-flight transient.
 * - PARTIAL: terminal partial; requires review of discrepancies before further action.
 * - FAILED:
 *     - Transient sync error (INTEGRATION.SCHEDULED_SYNC_FAILED or generic B3 failure): retry available.
 *     - Blocked (INTEGRATION.SCHEDULED_SOURCE_BLOCKED, INTEGRATION.SCHEDULED_NO_ACCOUNT): blocked until condition resolved.
 *     - Unsupported (INTEGRATION.UNSUPPORTED_SCHEDULED_SOURCE): unsupported configuration.
 *     - CSV failure: unsupported for automated background retry; user must re-submit file in import workspace.
 */
export function deriveOperationalRecovery(
  run: OperationalRecoveryRunInput,
  now: Date,
): OperationalRecovery {
  const { id: runId, portfolioId, source, status, errorCode, errorMessage, startedAt } = run;

  if (status === 'COMPLETED') {
    return {
      runId,
      portfolioId,
      source,
      status,
      recoveryState: 'NONE',
      recommendedAction: 'NONE',
      canRetry: false,
      canResume: false,
      requiresReview: false,
      reason: 'Execução concluída com sucesso.',
    };
  }

  if (status === 'AWAITING_REVIEW') {
    return {
      runId,
      portfolioId,
      source,
      status,
      recoveryState: 'REVIEW_REQUIRED',
      recommendedAction: 'VIEW_REVIEW',
      canRetry: false,
      canResume: false,
      requiresReview: true,
      reason: 'Execução aguarda revisão humana antes de ser confirmada no livro-razão.',
    };
  }

  // Phase 5S-F-R1: CONFIRMING has no dedicated transition timestamp in the database.
  // Using startedAt would evaluate stale age against run start rather than confirmation start
  // (STATE_AGE_BUG_CONFIRMED). Without a persisted confirmation timestamp, stale age detection
  // is unsupported (CONFIRMING_STALE_DETECTION_UNSUPPORTED). It remains in-flight.
  if (status === 'CONFIRMING') {
    return {
      runId,
      portfolioId,
      source,
      status,
      recoveryState: 'NONE',
      recommendedAction: 'NONE',
      canRetry: false,
      canResume: false,
      requiresReview: false,
      reason: 'Execução em processo de confirmação no livro-razão.',
    };
  }

  if (status === 'STARTED') {
    const elapsedMs = now.getTime() - startedAt.getTime();
    if (elapsedMs > INTERRUPTED_RUN_TIMEOUT_MS) {
      if (source === 'B3') {
        return {
          runId,
          portfolioId,
          source,
          status,
          recoveryState: 'INTERRUPTED',
          recommendedAction: 'RETRY',
          canRetry: true,
          canResume: false,
          requiresReview: false,
          reason: 'A execução foi interrompida antes da conclusão. É seguro tentar novamente.',
        };
      }
      return {
        runId,
        portfolioId,
        source,
        status,
        recoveryState: 'INTERRUPTED',
        recommendedAction: 'VIEW_IMPORT',
        canRetry: false,
        canResume: false,
        requiresReview: false,
        reason: 'A importação foi interrompida. Inicie uma nova importação na tela de importações.',
      };
    }
    return {
      runId,
      portfolioId,
      source,
      status,
      recoveryState: 'NONE',
      recommendedAction: 'NONE',
      canRetry: false,
      canResume: false,
      requiresReview: false,
      reason: 'Execução em processamento.',
    };
  }

  // Phase 5S-F-R1: PARTIAL is a terminal outcome. Terminal runs do not appear in ReviewInbox.
  // Exposing VIEW_REVIEW produces a false/dead-end navigation. Direct to VIEW_RUN factually.
  if (status === 'PARTIAL') {
    return {
      runId,
      portfolioId,
      source,
      status,
      recoveryState: 'NONE',
      recommendedAction: 'VIEW_RUN',
      canRetry: false,
      canResume: false,
      requiresReview: false,
      reason: 'A execução foi concluída parcialmente.',
    };
  }

  if (status === 'FAILED') {
    // Only strictly known transient error codes permit automated retry
    if (errorCode === 'INTEGRATION.SCHEDULED_SYNC_FAILED') {
      return {
        runId,
        portfolioId,
        source,
        status,
        recoveryState: 'RETRY_AVAILABLE',
        recommendedAction: 'RETRY',
        canRetry: true,
        canResume: false,
        requiresReview: false,
        reason: 'A sincronização falhou por erro temporário. Você pode tentar novamente.',
      };
    }

    if (errorCode === 'INTEGRATION.SCHEDULED_SOURCE_BLOCKED') {
      return {
        runId,
        portfolioId,
        source,
        status,
        recoveryState: 'BLOCKED',
        recommendedAction: 'VIEW_RUN',
        canRetry: false,
        canResume: false,
        requiresReview: false,
        reason: 'A fonte de integração está temporariamente bloqueada.',
      };
    }

    if (errorCode === 'INTEGRATION.SCHEDULED_NO_ACCOUNT') {
      return {
        runId,
        portfolioId,
        source,
        status,
        recoveryState: 'BLOCKED',
        recommendedAction: 'VIEW_RUN',
        canRetry: false,
        canResume: false,
        requiresReview: false,
        reason: 'Nenhuma conta cadastrada na carteira para realizar a sincronização.',
      };
    }

    if (errorCode === 'INTEGRATION.UNSUPPORTED_SCHEDULED_SOURCE') {
      return {
        runId,
        portfolioId,
        source,
        status,
        recoveryState: 'UNSUPPORTED',
        recommendedAction: 'VIEW_RUN',
        canRetry: false,
        canResume: false,
        requiresReview: false,
        reason: 'Fonte de dados não suportada para sincronização automática.',
      };
    }

    if (source === 'CSV') {
      return {
        runId,
        portfolioId,
        source,
        status,
        recoveryState: 'UNSUPPORTED',
        recommendedAction: 'VIEW_IMPORT',
        canRetry: false,
        canResume: false,
        requiresReview: false,
        reason: 'A importação de arquivo falhou. Envie o arquivo novamente na tela de importação.',
      };
    }

    return {
      runId,
      portfolioId,
      source,
      status,
      recoveryState: 'BLOCKED',
      recommendedAction: 'VIEW_RUN',
      canRetry: false,
      canResume: false,
      requiresReview: false,
      reason: errorMessage || 'A execução falhou e não pode ser repetida automaticamente.',
    };
  }

  return {
    runId,
    portfolioId,
    source,
    status,
    recoveryState: 'UNSUPPORTED',
    recommendedAction: 'VIEW_RUN',
    canRetry: false,
    canResume: false,
    requiresReview: false,
    reason: 'Estado da execução não suportado.',
  };
}

/**
 * Summarizes operational recovery across a window of runs.
 */
export function summarizeOperationalRecovery(
  runs: readonly OperationalRecoveryRunInput[],
  now: Date,
): OperationalRecoverySummary {
  let interruptedCount = 0;
  let retryableCount = 0;
  let reviewRequiredCount = 0;
  const items: OperationalRecovery[] = [];

  for (const run of runs) {
    const recovery = deriveOperationalRecovery(run, now);
    if (recovery.recoveryState !== 'NONE') {
      items.push(recovery);
    }
    if (recovery.recoveryState === 'INTERRUPTED') {
      interruptedCount += 1;
    }
    if (recovery.canRetry) {
      retryableCount += 1;
    }
    if (recovery.requiresReview) {
      reviewRequiredCount += 1;
    }
  }

  return {
    interruptedCount,
    retryableCount,
    reviewRequiredCount,
    items,
  };
}

