import type {
  UnifiedAnnualStatus,
  UnifiedConsistencyIssue,
  UnifiedModuleContribution,
} from './unified-annual-irpf';

/**
 * Phase 4J.1 — frozen global status & precedence (pure, deterministic).
 *
 * Precedence (highest wins):
 *   BLOCKED > REQUIRES_ACTION > PARTIAL > READY_FOR_REVIEW > NO_ACTIVITY
 *
 * NO status collapse: BLOCKED never degrades to PARTIAL; an UNKNOWN/unmapped
 * native value never maps to READY (the service maps it to UNSUPPORTED +
 * UNMAPPED_STATUS before this fold ever runs). NOT_APPLICABLE and NO_ACTIVITY
 * modules do not by themselves block. An UNSUPPORTED module that materially
 * affects filing readiness prevents a global READY_FOR_REVIEW.
 */

const PRECEDENCE: readonly UnifiedAnnualStatus[] = [
  'BLOCKED',
  'REQUIRES_ACTION',
  'PARTIAL',
  'READY_FOR_REVIEW',
  'NO_ACTIVITY',
];

export function unifiedStatusRank(status: UnifiedAnnualStatus): number {
  const index = PRECEDENCE.indexOf(status);
  // UNSUPPORTED is handled outside the precedence ladder; treat as least severe
  // ordering fallback only (never selected by maxUnifiedStatus directly).
  return index === -1 ? PRECEDENCE.length : index;
}

/** Return the more severe of two global statuses per the frozen precedence. */
export function maxUnifiedStatus(
  a: UnifiedAnnualStatus,
  b: UnifiedAnnualStatus,
): UnifiedAnnualStatus {
  return unifiedStatusRank(a) <= unifiedStatusRank(b) ? a : b;
}

/**
 * Derive the unified global status from the module contributions + consistency
 * issues. Pure and total. Order-independent.
 */
export function deriveUnifiedGlobalStatus(
  modules: readonly UnifiedModuleContribution[],
  consistencyIssues: readonly UnifiedConsistencyIssue[],
): UnifiedAnnualStatus {
  const hasBlockingIssue = consistencyIssues.some((i) => i.severity === 'BLOCKING');

  // A module participates in readiness only when it is material to filing.
  const materialModules = modules.filter((m) => m.material);

  const anyBlocked = modules.some((m) => m.status === 'BLOCKED');
  if (hasBlockingIssue || anyBlocked) {
    return 'BLOCKED';
  }

  const anyRequiresConfirmation = modules.some((m) => m.status === 'REQUIRES_CONFIRMATION');
  if (anyRequiresConfirmation) {
    return 'REQUIRES_ACTION';
  }

  // A material UNSUPPORTED module cannot be READY. If a material module is
  // UNSUPPORTED while other material modules carry real state, degrade to
  // REQUIRES_ACTION (the unsupported fact needs resolution); if it is the ONLY
  // material fact, the whole state is UNSUPPORTED.
  const materialUnsupported = materialModules.filter((m) => m.status === 'UNSUPPORTED');
  if (materialUnsupported.length > 0) {
    const otherMaterialWithState = materialModules.some(
      (m) =>
        m.status !== 'UNSUPPORTED' && m.status !== 'NO_ACTIVITY' && m.status !== 'NOT_APPLICABLE',
    );
    return otherMaterialWithState ? 'REQUIRES_ACTION' : 'UNSUPPORTED';
  }

  const anyPartial = modules.some((m) => m.status === 'PARTIAL');
  if (anyPartial) {
    return 'PARTIAL';
  }

  // No blocking, no action, no partial, no material-unsupported. If every module
  // is NO_ACTIVITY/NOT_APPLICABLE, there is nothing to review.
  const everyInertOrNotApplicable = modules.every(
    (m) => m.status === 'NO_ACTIVITY' || m.status === 'NOT_APPLICABLE',
  );
  if (everyInertOrNotApplicable) {
    return 'NO_ACTIVITY';
  }

  // Remaining case: at least one READY module, all others coherent
  // (READY / NO_ACTIVITY / NOT_APPLICABLE), no blocking, no action, no partial.
  return 'READY_FOR_REVIEW';
}
