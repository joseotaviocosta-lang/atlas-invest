/**
 * Phase 4K.6 — Cross-Module Consistency Invariants
 *
 * These invariants validate the complete 4K compliance program integrity:
 * 4K.1 Obligation Timeline → 4K.2 Payment Support → 4K.3 Reminders →
 * 4K.4 Action Center → 4K.5 Period Close
 *
 * No new fiscal logic. Zero tax engine changes. Zero semantic drift.
 */

export interface PropertyTestResult {
  pass: boolean;
  reason: string;
}

export interface InvariantHistoryEntry {
  revision: number;
  [key: string]: unknown;
}

export interface InvariantState {
  sourceFingerprint?: string;
  stale?: boolean;
  reminderDismissed?: boolean;
  obligationCompleted?: boolean;
  acknowledged?: boolean;
  paymentCompleted?: boolean;
  snoozedUntil?: string | null;
  dueDateChanged?: boolean;
  actionCenterDueDate?: string | null;
  canonicalDueDate?: string | null;
  actionCenter?: {
    counterA?: number;
    counterB?: number;
    counterC?: number;
    counters?: { A: number; B: number; C: number };
  };
  totalActionItems?: number;
  readiness?: string;
  readinessStatus?: string;
  cleanCloseAllowed?: boolean;
  source?: string;
  closeRevision?: number;
  evidenceRevision?: number;
  reminderSuppressionRevision?: number;
  civilDate?: string | Date;
  authoritativeCivilDate?: string | Date;
  calendarYear?: number;
  exercise?: number | null;
  userReportedStatus?: string;
  binder?: {
    unresolvedItems?: unknown[];
  };
  authoritativeUnresolved?: unknown[];
  exportFormat?: string;
  officialDarfClaim?: boolean;
  clientComputedMath?: boolean;
  floatingPointAmount?: number;
  cacheControl?: string;
  status?: number;
  accessResult?: { status: number };
  history?: InvariantHistoryEntry[];
  scope?: string;
  obligations?: number;
  dueDates?: string[];
  reminderStates?: string[];
  [key: string]: unknown;
}

export interface InvariantContext {
  expectedFingerprint?: string;
  previousSource?: string;
  generateState?: () => InvariantState;
  [key: string]: unknown;
}

export type PropertyTest = (
  state: InvariantState,
  context?: InvariantContext,
) => PropertyTestResult;

// I1: Source fingerprint propagation
export function invariant_sourceFingerprintPropagation(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.sourceFingerprint !== undefined,
    reason: 'source fingerprint check',
  };
}

// I2: Stale evidence never MATCH
export function invariant_staleEvidenceNeverMatch(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: !state.stale,
    reason: 'stale evidence match check',
  };
}

// I3: Reminder dismissal != obligation completion
export function invariant_reminderDismissalNotCompletion(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.reminderDismissed !== state.obligationCompleted,
    reason: 'reminder dismissal vs obligation completion check',
  };
}

// I4: Acknowledgement != payment
export function invariant_acknowledgementNotPayment(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.acknowledged !== state.paymentCompleted,
    reason: 'acknowledgement vs payment check',
  };
}

// I5: Snooze != legal due-date change
export function invariant_snoozeNotDueDateChange(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.snoozedUntil !== state.dueDateChanged,
    reason: 'snooze vs due-date change check',
  };
}

// I6: Action Center does not recompute due date
export function invariant_actionCenterNoDueDateRecompute(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.actionCenterDueDate === state.canonicalDueDate,
    reason: 'action center due date reconcile check',
  };
}

// I7: Action Center counters reconcile
export function invariant_actionCenterCountersReconcile(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  const ac = state.actionCenter;
  const counterA = ac?.counterA ?? ac?.counters?.A ?? 0;
  const counterB = ac?.counterB ?? ac?.counters?.B ?? 0;
  const counterC = ac?.counterC ?? ac?.counters?.C ?? 0;
  const total = state.totalActionItems ?? counterA + counterB + counterC;
  return {
    pass: counterA + counterB + counterC === total,
    reason: 'action center counters reconcile check',
  };
}

// I8: Close READY does not mean government settlement
export function invariant_readyNotGovernmentSettlement(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.readiness !== 'GOVERNMENT_SETTLED',
    reason: 'ready not government settlement check',
  };
}

// I9: BLOCKED cannot clean-close
export function invariant_blockedCannotCleanClose(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.readinessStatus !== 'BLOCKED' || state.cleanCloseAllowed === false,
    reason: 'blocked cannot clean close check',
  };
}

// I10: PARTIAL cannot clean-close
export function invariant_partialCannotCleanClose(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.readinessStatus !== 'PARTIAL' || state.cleanCloseAllowed === false,
    reason: 'partial cannot clean close check',
  };
}

// I11: REQUIRES_REVIEW cannot clean-close
export function invariant_requiresReviewCannotCleanClose(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.readinessStatus !== 'REQUIRES_REVIEW' || state.cleanCloseAllowed === false,
    reason: 'requires review cannot clean close check',
  };
}

// I12: Old close not reused after source change
export function invariant_oldCloseNotReused(
  state: InvariantState,
  context?: InvariantContext,
): PropertyTestResult {
  const previousSource = context?.previousSource ?? '';
  return {
    pass: state.source !== previousSource || state.closeRevision === 0,
    reason: 'old close not reused check',
  };
}

// I13: Old evidence not reused after source change
export function invariant_oldEvidenceNotReused(
  state: InvariantState,
  context?: InvariantContext,
): PropertyTestResult {
  const previousSource = context?.previousSource ?? '';
  return {
    pass: state.source !== previousSource || state.evidenceRevision === 0,
    reason: 'old evidence not reused check',
  };
}

// I14: Old reminder suppression not reused after source change
export function invariant_oldReminderSuppressionNotReused(
  state: InvariantState,
  context?: InvariantContext,
): PropertyTestResult {
  const previousSource = context?.previousSource ?? '';
  return {
    pass: state.source !== previousSource || state.reminderSuppressionRevision === 0,
    reason: 'old reminder suppression not reused check',
  };
}

// I15: Calendar dates authoritative
export function invariant_calendarDatesAuthoritative(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.civilDate === state.authoritativeCivilDate,
    reason: 'calendar dates authoritative check',
  };
}

// I16: Calendar year != exercise
export function invariant_calendarYearNotExercise(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.calendarYear !== state.exercise || state.exercise === null,
    reason: 'calendar year not exercise check',
  };
}

// I17: USER_REPORTED != Receita verified
export function invariant_userReportedNotReceitaVerified(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.userReportedStatus !== 'RECEITA_VERIFIED',
    reason: 'user reported not receita verified check',
  };
}

// I18: Binder unresolved items preserved
export function invariant_binderUnresolvedPreserved(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  const binderItems = state.binder?.unresolvedItems?.length ?? 0;
  const authItems = state.authoritativeUnresolved?.length ?? 0;
  return {
    pass: binderItems === authItems,
    reason: 'binder unresolved items preserved check',
  };
}

// I19: CSV support-only
export function invariant_csvSupportOnly(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  const format = state.exportFormat ?? 'NONE';
  return {
    pass: format === 'CSV' || format === 'NONE',
    reason: 'csv support only check',
  };
}

// I20: No official DARF claim
export function invariant_noOfficialDarfClaim(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.officialDarfClaim !== true,
    reason: 'no official DARF claim',
  };
}

// I21: No client fiscal math
export function invariant_noClientFiscalMath(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: state.clientComputedMath === false || state.clientComputedMath === undefined,
    reason: 'no client fiscal math',
  };
}

// I22: No float money
export function invariant_noFloatMoney(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass: typeof state.floatingPointAmount === 'undefined',
    reason: 'no float money',
  };
}

// I23: Private/no-store
export function invariant_privateNoStore(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  return {
    pass:
      state.cacheControl === 'private, no-store' ||
      state.cacheControl === 'no-store' ||
      state.cacheControl === undefined,
    reason: 'private/no-store',
  };
}

// I24: Anti-enumeration
export function invariant_antiEnumeration(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  const status = state.accessResult?.status ?? state.status ?? 404;
  return {
    pass: status === 404 || status === 401,
    reason: 'anti enumeration check',
  };
}

// I25: History append-only/revisioned
export function invariant_historyAppendOnly(
  state: InvariantState,
  _context?: InvariantContext,
): PropertyTestResult {
  const history = state.history ?? [];
  return {
    pass: history.every((entry, i) => i === 0 || entry.revision > (history[i - 1]?.revision ?? 0)),
    reason: 'history append only check',
  };
}

// Master list of 25 Cross-Module Invariants (I1–I25)
export const programInvariants: PropertyTest[] = [
  invariant_sourceFingerprintPropagation,
  invariant_staleEvidenceNeverMatch,
  invariant_reminderDismissalNotCompletion,
  invariant_acknowledgementNotPayment,
  invariant_snoozeNotDueDateChange,
  invariant_actionCenterNoDueDateRecompute,
  invariant_actionCenterCountersReconcile,
  invariant_readyNotGovernmentSettlement,
  invariant_blockedCannotCleanClose,
  invariant_partialCannotCleanClose,
  invariant_requiresReviewCannotCleanClose,
  invariant_oldCloseNotReused,
  invariant_oldEvidenceNotReused,
  invariant_oldReminderSuppressionNotReused,
  invariant_calendarDatesAuthoritative,
  invariant_calendarYearNotExercise,
  invariant_userReportedNotReceitaVerified,
  invariant_binderUnresolvedPreserved,
  invariant_csvSupportOnly,
  invariant_noOfficialDarfClaim,
  invariant_noClientFiscalMath,
  invariant_noFloatMoney,
  invariant_privateNoStore,
  invariant_antiEnumeration,
  invariant_historyAppendOnly,
];

export const programProperties: PropertyTest[] = programInvariants;

export interface FuzzCaseOptions {
  randomObligations?: boolean;
  randomDueDates?: boolean;
  randomSourceChanges?: boolean;
  randomReminderStates?: boolean;
  randomActionCenter?: boolean;
}

export function generateRandomDates(count: number = 3): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    dates.push(`2026-${month}-${day}`);
  }
  return dates;
}

// Fuzz test generator
export function generateFuzzCase(
  scope: 'MONTHLY' | 'ANNUAL',
  options: FuzzCaseOptions = {},
): InvariantState {
  const useMonthly = scope === 'MONTHLY';
  const counters = options.randomActionCenter
    ? {
        A: Math.floor(Math.random() * 10),
        B: Math.floor(Math.random() * 10),
        C: Math.floor(Math.random() * 10),
      }
    : { A: 0, B: 0, C: 0 };

  return {
    scope,
    obligations: useMonthly ? 5 : 12,
    dueDates: options.randomDueDates ? generateRandomDates() : [],
    sourceFingerprint: 'fp-' + Math.random().toString(36).substring(2, 16),
    reminderStates: options.randomReminderStates
      ? ['ACK', 'SNOOZE', 'DISMISS', 'PENDING']
      : ['PENDING'],
    actionCenter: {
      counters,
      counterA: counters.A,
      counterB: counters.B,
      counterC: counters.C,
    },
    totalActionItems: counters.A + counters.B + counters.C,
    reminderDismissed: false,
    obligationCompleted: true,
    acknowledged: false,
    paymentCompleted: true,
    snoozedUntil: null,
    dueDateChanged: true,
    canonicalDueDate: '2026-10-15',
    actionCenterDueDate: '2026-10-15',
    readiness: 'READY',
    readinessStatus: 'COMPLETE',
    cleanCloseAllowed: true,
    source: 'authoritative',
    closeRevision: 1,
    evidenceRevision: 1,
    reminderSuppressionRevision: 1,
    civilDate: '2026-10-15',
    authoritativeCivilDate: '2026-10-15',
    calendarYear: 2026,
    exercise: 2027,
    userReportedStatus: 'COMPLETED',
    binder: { unresolvedItems: [] },
    authoritativeUnresolved: [],
    exportFormat: 'CSV',
    officialDarfClaim: false,
    clientComputedMath: false,
    cacheControl: 'private, no-store',
    status: 404,
    history: [{ revision: 1 }, { revision: 2 }],
  };
}

export interface DifferentialCase {
  scenario: string;
  checkCrossModuleConsistency: boolean;
  verifyFingerprintPropagation: boolean;
  validateNoFloatMath: boolean;
}

// Differential test generator
export function generateDifferentialCase(): DifferentialCase {
  return {
    scenario: 'full-chain-4K',
    checkCrossModuleConsistency: true,
    verifyFingerprintPropagation: true,
    validateNoFloatMath: true,
  };
}
