import type { UnifiedConsistencyIssue, UnifiedModuleId } from './unified-annual-irpf';

/**
 * Phase 4J.1 — cross-regime consistency engine (pure, deterministic).
 *
 * Consistency compares IDENTITY + gross-economic-PROVENANCE (fingerprints) +
 * PAYER IDENTITY only. It performs NO amount math and NO tax-classification
 * comparison. A source fact legitimately classified differently across 4H vs
 * 4I (e.g. exempt vs included) is NOT an error.
 *
 * ANNUAL_AMOUNT_MISMATCH is DROPPED as blocking and NOT emitted by default — it
 * is uncomputable from the frozen read models (no per-payer gross exists in 4I)
 * and attempting it would fabricate false BLOCKING errors.
 */

/** A loaded module's identity facts (year + its own declarationExercise). */
export interface ConsistencyModuleIdentity {
  readonly module: UnifiedModuleId;
  readonly calendarYear: number | null;
  readonly declarationExercise: number | null;
}

export interface ConsistencyInput {
  /** The requested calendar year (identity authority). */
  readonly requestedCalendarYear: number;
  /** Locally-derived declaration exercise (`calendarYear + 1`). */
  readonly localDeclarationExercise: number;
  /** Identity facts for every loaded module. */
  readonly moduleIdentities: readonly ConsistencyModuleIdentity[];

  /**
   * High-income provenance (null when HIGH_INCOME is NOT_APPLICABLE/UNSUPPORTED
   * — in which case the provenance/payer checks are SKIPPED, not failed).
   */
  readonly highIncome: {
    readonly upstreamIncomeFingerprint: string;
    readonly upstreamCapitalMarketFingerprint: string;
    readonly upstreamIncomeStatus: string;
    /** payerIds referenced by 4I evidence ∪ corporateRedutor payers. */
    readonly payerIds: readonly string[];
    /** 4I evidence conflict/stale signals. */
    readonly hasConflictingEvidence: boolean;
    readonly hasStaleRequiredEvidence: boolean;
    /** Forced BLOCKED by UPSTREAM_SNAPSHOT_INCONSISTENT (§5.6). */
    readonly forcedUpstreamSnapshotInconsistent: boolean;
  } | null;

  /** Freshly-loaded 4H.4 income fingerprint (null when income not loaded). */
  readonly incomeFingerprint: string | null;
  /** Freshly-loaded 4H.3 capital-market fingerprint (null when not loaded). */
  readonly capitalMarketFingerprint: string | null;
  /** 4H.4 payer universe (payerIds). */
  readonly incomePayerIds: readonly string[];

  /** 4H.5 readiness has a required STALE confirmation gating a section. */
  readonly hasStaleRequiredConfirmation: boolean;
}

function blocking(
  code: UnifiedConsistencyIssue['code'],
  modules: readonly UnifiedModuleId[],
  detail: string,
): UnifiedConsistencyIssue {
  return { code, severity: 'BLOCKING', modules, detail };
}

/**
 * Detect all cross-regime consistency issues. Pure, order-independent, no float,
 * no raw DB ids and no financial amounts in any `detail` string.
 */
export function detectUnifiedConsistencyIssues(
  input: ConsistencyInput,
): readonly UnifiedConsistencyIssue[] {
  const issues: UnifiedConsistencyIssue[] = [];

  // --- Identity: YEAR_MISMATCH ---
  for (const id of input.moduleIdentities) {
    if (id.calendarYear !== null && id.calendarYear !== input.requestedCalendarYear) {
      issues.push(
        blocking(
          'YEAR_MISMATCH',
          [id.module],
          `Module ${id.module} reported a calendar year differing from the requested year.`,
        ),
      );
    }
  }

  // --- Identity: EXERCISE_MISMATCH ---
  // Any module whose declarationExercise disagrees with the local derivation
  // (calendarYear + 1). Modules disagreeing with each other necessarily
  // disagree with the local value, so a single local comparison is sufficient.
  for (const id of input.moduleIdentities) {
    if (
      id.declarationExercise !== null &&
      id.declarationExercise !== input.localDeclarationExercise
    ) {
      issues.push(
        blocking(
          'EXERCISE_MISMATCH',
          [id.module],
          `Module ${id.module} reported a declaration exercise differing from the canonical exercise.`,
        ),
      );
    }
  }

  const hi = input.highIncome;

  // --- Provenance / payer checks: only when HIGH_INCOME consumed upstream facts ---
  if (hi !== null) {
    // SOURCE_FINGERPRINT_MISMATCH — income provenance.
    if (
      input.incomeFingerprint !== null &&
      hi.upstreamIncomeFingerprint !== input.incomeFingerprint
    ) {
      issues.push(
        blocking(
          'SOURCE_FINGERPRINT_MISMATCH',
          ['INVESTMENT_INCOME', 'HIGH_INCOME_MINIMUM_TAX'],
          'High-income assessment was computed from a different revision of the annual investment income facts.',
        ),
      );
    }

    // SOURCE_FINGERPRINT_MISMATCH — capital-market provenance.
    if (
      input.capitalMarketFingerprint !== null &&
      hi.upstreamCapitalMarketFingerprint !== input.capitalMarketFingerprint
    ) {
      issues.push(
        blocking(
          'SOURCE_FINGERPRINT_MISMATCH',
          ['CAPITAL_MARKETS', 'HIGH_INCOME_MINIMUM_TAX'],
          'High-income assessment was computed from a different revision of the annual capital-market facts.',
        ),
      );
    }

    // PAYER_IDENTITY_MISMATCH — one-directional provenance invariant only.
    //
    // The ONLY valid provenance invariant is: 4I must never reference a payer
    // that the 4H.4 income universe never produced (`orphanInHighIncome`). 4I
    // derives from 4H facts, so a 4I payer absent from 4H.4 is a genuine skew.
    //
    // The REVERSE direction (a 4H.4 income payer absent from 4I's redutor /
    // evidence subset) is EXPECTED and benign: 4I legitimately tracks only the
    // payers relevant to the minimum tax (another dividend payer without
    // recorded corporate evidence, or any JCP/FII payer, is normal for a
    // diversified high-income filer). Flagging it would false-block a legitimate
    // subject, so it is NOT an error (§7.3 / §29 boundary — never flag a
    // legitimate cross-regime difference).
    const incomePayers = new Set(input.incomePayerIds);
    const orphanInHighIncome = hi.payerIds.some((p) => !incomePayers.has(p));
    if (orphanInHighIncome) {
      issues.push(
        blocking(
          'PAYER_IDENTITY_MISMATCH',
          ['INVESTMENT_INCOME', 'HIGH_INCOME_MINIMUM_TAX'],
          'The high-income module references a payer identity absent from the annual investment income payer universe.',
        ),
      );
    }

    // CONFLICTING_EVIDENCE.
    if (hi.hasConflictingEvidence) {
      issues.push(
        blocking(
          'CONFLICTING_EVIDENCE',
          ['HIGH_INCOME_MINIMUM_TAX'],
          'High-income evidence is in conflict and requires resolution.',
        ),
      );
    }

    // STALE_CONFIRMATION — high-income side.
    if (hi.hasStaleRequiredEvidence) {
      issues.push(
        blocking(
          'STALE_CONFIRMATION',
          ['HIGH_INCOME_MINIMUM_TAX'],
          'High-income evidence a required requirement depends on is stale.',
        ),
      );
    }

    // UPSTREAM_NOT_READY.
    if (hi.upstreamIncomeStatus === 'BLOCKED' || hi.forcedUpstreamSnapshotInconsistent) {
      issues.push(
        blocking(
          'UPSTREAM_NOT_READY',
          ['HIGH_INCOME_MINIMUM_TAX'],
          'The high-income assessment could not derive authoritative figures because an upstream module is not ready.',
        ),
      );
    }
  }

  // --- STALE_CONFIRMATION — readiness side (independent of high-income) ---
  if (input.hasStaleRequiredConfirmation) {
    issues.push(
      blocking(
        'STALE_CONFIRMATION',
        ['READINESS_EVIDENCE'],
        'A required readiness confirmation is stale and gates a filing section.',
      ),
    );
  }

  return issues;
}
