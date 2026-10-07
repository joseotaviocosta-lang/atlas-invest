import { createHash } from 'crypto';
import { stableStringify } from './high-income-review-package';

/**
 * Phase 4J.1 — Unified Annual IRPF Orchestration (pure model + assembler).
 *
 * This module is ORCHESTRATION ONLY. It projects the already-computed
 * authoritative outputs of Phase 4H (general annual IRPF) and Phase 4I
 * (high-income minimum tax, IRPFM) into one deterministic, serializable
 * annual fiscal state. It performs NO tax math of any kind (no capital gains,
 * average price, monthly tax, annual market result, dividends, JCP, FII tax,
 * high-income threshold/rate, corporate redutor, credits), introduces NO third
 * tax engine, performs NO cross-module recomputation, and persists nothing.
 *
 * The authoritative flow is strictly:
 *   ledger -> canonical fiscal engines -> 4H/4I authoritative derived results
 *          -> unified annual orchestration (THIS module) -> review UX
 * never `ledger -> 4J calculation`.
 *
 * No float is used anywhere: all source markers are strings/fingerprints, and
 * the only optional amount sanity check (not emitted by default) uses `Money`
 * decimal-string equality — never IEEE-754 arithmetic.
 */

// ---------------------------------------------------------------------------
// Module identity, vocabulary & model
// ---------------------------------------------------------------------------

export type UnifiedModuleId =
  | 'ANNUAL_POSITIONS'
  | 'CAPITAL_MARKETS'
  | 'INVESTMENT_INCOME'
  | 'READINESS_EVIDENCE'
  | 'HIGH_INCOME_MINIMUM_TAX';

/** Canonical module order used for deterministic sorting before hashing. */
export const UNIFIED_MODULE_ORDER: readonly UnifiedModuleId[] = [
  'ANNUAL_POSITIONS',
  'CAPITAL_MARKETS',
  'INVESTMENT_INCOME',
  'READINESS_EVIDENCE',
  'HIGH_INCOME_MINIMUM_TAX',
];

export type UnifiedModuleSource = '4H.2' | '4H.3' | '4H.4' | '4H.5' | '4I';

export type UnifiedModuleStatus =
  | 'READY'
  | 'PARTIAL'
  | 'REQUIRES_CONFIRMATION'
  | 'BLOCKED'
  | 'NO_ACTIVITY'
  | 'NOT_APPLICABLE'
  | 'UNSUPPORTED';

/**
 * Closed vocabulary for the blocking reasons 4J SYNTHESISES itself (fail-closed
 * markers). Native 4H/4I blockingReasons pass through verbatim as free strings;
 * only these three are minted by the unified layer.
 */
export type UnifiedBlockingReason =
  'MODULE_LOAD_FAILED' | 'UNMAPPED_STATUS' | 'UPSTREAM_SNAPSHOT_INCONSISTENT';

export const UNIFIED_SYNTHESISED_BLOCKING_REASONS: readonly UnifiedBlockingReason[] = [
  'MODULE_LOAD_FAILED',
  'UNMAPPED_STATUS',
  'UPSTREAM_SNAPSHOT_INCONSISTENT',
];

export type UnifiedAnnualStatus =
  'READY_FOR_REVIEW' | 'REQUIRES_ACTION' | 'PARTIAL' | 'BLOCKED' | 'NO_ACTIVITY' | 'UNSUPPORTED';

export type UnifiedConsistencyCode =
  | 'YEAR_MISMATCH'
  | 'EXERCISE_MISMATCH'
  | 'SOURCE_FINGERPRINT_MISMATCH'
  | 'PAYER_IDENTITY_MISMATCH'
  | 'STALE_CONFIRMATION'
  | 'CONFLICTING_EVIDENCE'
  | 'UPSTREAM_NOT_READY'
  // WARNING-only variant only; never BLOCKING and NOT emitted by default (§7.5).
  | 'ANNUAL_AMOUNT_MISMATCH';

export type UnifiedConsistencySeverity = 'BLOCKING' | 'WARNING';

export interface UnifiedConsistencyIssue {
  readonly code: UnifiedConsistencyCode;
  readonly severity: UnifiedConsistencySeverity;
  readonly modules: readonly UnifiedModuleId[];
  readonly detail: string;
}

export interface UnifiedRequirement {
  /** Canonical dedup key — NEVER contains a DB UUID. */
  readonly key: string;
  readonly module: UnifiedModuleId;
  readonly category: string;
  readonly nativeType: string;
  /** Normalized subject reference — never a raw DB id. */
  readonly subjectReference: string;
  /** Native requirement status, surfaced verbatim. */
  readonly status: string;
  readonly blockingReason: string | null;
}

export interface UnifiedModuleSummary {
  readonly module: UnifiedModuleId;
  readonly source: UnifiedModuleSource;
  readonly status: UnifiedModuleStatus;
  readonly authoritative: boolean;
  readonly blockingReasons: readonly (UnifiedBlockingReason | string)[];
  readonly requirements: readonly UnifiedRequirement[];
  readonly sourceFingerprint: string;
  /** ONLY 4I populates this; null for all 4H modules. */
  readonly calculationFingerprint: string | null;
}

export interface UnifiedRuleVersions {
  readonly annualPositions: string | null;
  readonly capitalMarkets: null;
  readonly investmentIncome: null;
  readonly readinessEvidence: null;
  readonly highIncome: string | null;
}

export interface UnifiedAnnualIdentity {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly taxSubjectId: string;
  readonly ruleVersions: UnifiedRuleVersions;
  readonly generatedAt: string;
  readonly sourceFingerprint: string;
  readonly annualFingerprint: string;
  readonly status: UnifiedAnnualStatus;
}

export interface UnifiedAnnualSummary {
  readonly moduleCount: number;
  readonly readyCount: number;
  readonly actionRequiredCount: number;
  readonly blockedCount: number;
  readonly noActivityCount: number;
  readonly notApplicableCount: number;
  readonly unsupportedCount: number;
  readonly consistencyIssueCount: number;
  readonly blockingIssueCount: number;
}

export interface UnifiedAnnualIrpfState {
  readonly identity: UnifiedAnnualIdentity;
  readonly modules: readonly UnifiedModuleSummary[];
  readonly requirements: readonly UnifiedRequirement[];
  readonly consistencyIssues: readonly UnifiedConsistencyIssue[];
  readonly summary: UnifiedAnnualSummary;
}

// ---------------------------------------------------------------------------
// Assembler input (already-mapped module contributions supplied by the service)
// ---------------------------------------------------------------------------

/**
 * A single module's already-mapped contribution. The application service does
 * all the loading + native-status mapping; this pure module only sorts,
 * deduplicates, derives global status, and fingerprints. `module`, `source`,
 * `status`, `authoritative`, `blockingReasons`, `requirements`,
 * `sourceFingerprint`, `calculationFingerprint` are the module summary fields;
 * `material` flags whether the module materially affects filing readiness;
 * `evidenceFingerprints` feeds the content fingerprint; `declarationExercise`
 * is the module's own value used ONLY for the EXERCISE_MISMATCH cross-check.
 */
export interface UnifiedModuleContribution {
  readonly module: UnifiedModuleId;
  readonly source: UnifiedModuleSource;
  readonly status: UnifiedModuleStatus;
  readonly authoritative: boolean;
  readonly material: boolean;
  readonly blockingReasons: readonly (UnifiedBlockingReason | string)[];
  readonly requirements: readonly UnifiedRequirement[];
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string | null;
  readonly evidenceFingerprints: readonly string[];
  /** The module's own declarationExercise, or null if it did not supply one. */
  readonly declarationExercise: number | null;
}

export interface BuildUnifiedAnnualIrpfInput {
  readonly calendarYear: number;
  readonly taxSubjectId: string;
  readonly generatedAt: string;
  readonly ruleVersions: UnifiedRuleVersions;
  readonly modules: readonly UnifiedModuleContribution[];
  readonly consistencyIssues: readonly UnifiedConsistencyIssue[];
}

// ---------------------------------------------------------------------------
// Deterministic sort helpers
// ---------------------------------------------------------------------------

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function moduleOrderIndex(module: UnifiedModuleId): number {
  return UNIFIED_MODULE_ORDER.indexOf(module);
}

function sortModules(
  modules: readonly UnifiedModuleContribution[],
): readonly UnifiedModuleContribution[] {
  return [...modules].sort((a, b) => moduleOrderIndex(a.module) - moduleOrderIndex(b.module));
}

function sortBlockingReasons(
  reasons: readonly (UnifiedBlockingReason | string)[],
): readonly string[] {
  return [...reasons].sort(compareStrings);
}

function compareRequirements(a: UnifiedRequirement, b: UnifiedRequirement): number {
  return (
    compareStrings(a.module, b.module) ||
    compareStrings(a.category, b.category) ||
    compareStrings(a.subjectReference, b.subjectReference) ||
    compareStrings(a.nativeType, b.nativeType) ||
    compareStrings(a.key, b.key)
  );
}

function sortConsistencyIssues(
  issues: readonly UnifiedConsistencyIssue[],
): readonly UnifiedConsistencyIssue[] {
  return [...issues].sort(
    (a, b) =>
      compareStrings(a.code, b.code) ||
      compareStrings(a.severity, b.severity) ||
      compareStrings([...a.modules].sort().join(','), [...b.modules].sort().join(',')) ||
      compareStrings(a.detail, b.detail),
  );
}

// ---------------------------------------------------------------------------
// Requirement aggregation & semantic-key dedup (§8)
// ---------------------------------------------------------------------------

/** Normalize a subject reference: lowercased + trimmed. Never a DB id. */
export function normalizeSubjectReference(value: string): string {
  return value.trim().toLowerCase();
}

/** Build the canonical semantic key for a requirement (never contains a UUID). */
export function buildRequirementKey(input: {
  module: UnifiedModuleId;
  category: string;
  subjectReference: string;
  nativeType: string;
}): string {
  return `${input.module}::${input.category}::${normalizeSubjectReference(
    input.subjectReference,
  )}::${input.nativeType}`;
}

/**
 * Aggregate requirements across modules and collapse identical semantic keys.
 * Similar labels with different keys stay separate. Deterministically sorted.
 */
export function aggregateRequirements(
  modules: readonly UnifiedModuleContribution[],
): readonly UnifiedRequirement[] {
  const byKey = new Map<string, UnifiedRequirement>();
  for (const mod of modules) {
    for (const req of mod.requirements) {
      if (!byKey.has(req.key)) {
        byKey.set(req.key, req);
      }
    }
  }
  return [...byKey.values()].sort(compareRequirements);
}

// ---------------------------------------------------------------------------
// Fingerprint (deterministic, order-independent, generatedAt EXCLUDED) (§9)
// ---------------------------------------------------------------------------

interface UnifiedFingerprintModuleEntry {
  readonly module: UnifiedModuleId;
  readonly status: UnifiedModuleStatus;
  readonly authoritative: boolean;
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string | null;
  readonly blockingReasons: readonly string[];
}

export interface UnifiedAnnualFingerprintInput {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly ruleVersions: UnifiedRuleVersions;
  readonly modules: readonly UnifiedFingerprintModuleEntry[];
  readonly evidenceFingerprints: readonly string[];
  readonly consistencyIssues: readonly UnifiedConsistencyIssue[];
  readonly requirements: ReadonlyArray<{
    readonly key: string;
    readonly status: string;
    readonly blockingReason: string | null;
  }>;
}

export interface UnifiedSourceFingerprintInput {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly ruleVersions: UnifiedRuleVersions;
  readonly modules: ReadonlyArray<{
    readonly module: UnifiedModuleId;
    readonly sourceFingerprint: string;
    readonly calculationFingerprint: string | null;
  }>;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function computeUnifiedAnnualFingerprint(
  canonicalContent: UnifiedAnnualFingerprintInput,
): string {
  return sha256Hex(stableStringify(canonicalContent));
}

export function computeUnifiedSourceFingerprint(input: UnifiedSourceFingerprintInput): string {
  return sha256Hex(stableStringify(input));
}

// ---------------------------------------------------------------------------
// Pure assembler
// ---------------------------------------------------------------------------

function toModuleSummary(contribution: UnifiedModuleContribution): UnifiedModuleSummary {
  return {
    module: contribution.module,
    source: contribution.source,
    status: contribution.status,
    authoritative: contribution.authoritative,
    blockingReasons: sortBlockingReasons(contribution.blockingReasons),
    requirements: [...contribution.requirements].sort(compareRequirements),
    sourceFingerprint: contribution.sourceFingerprint,
    calculationFingerprint: contribution.calculationFingerprint,
  };
}

function computeSummary(
  modules: readonly UnifiedModuleSummary[],
  consistencyIssues: readonly UnifiedConsistencyIssue[],
): UnifiedAnnualSummary {
  let readyCount = 0;
  let actionRequiredCount = 0;
  let blockedCount = 0;
  let noActivityCount = 0;
  let notApplicableCount = 0;
  let unsupportedCount = 0;
  for (const mod of modules) {
    switch (mod.status) {
      case 'READY':
        readyCount += 1;
        break;
      case 'PARTIAL':
      case 'REQUIRES_CONFIRMATION':
        actionRequiredCount += 1;
        break;
      case 'BLOCKED':
        blockedCount += 1;
        break;
      case 'NO_ACTIVITY':
        noActivityCount += 1;
        break;
      case 'NOT_APPLICABLE':
        notApplicableCount += 1;
        break;
      case 'UNSUPPORTED':
        unsupportedCount += 1;
        break;
    }
  }
  const blockingIssueCount = consistencyIssues.filter((i) => i.severity === 'BLOCKING').length;
  return {
    moduleCount: modules.length,
    readyCount,
    actionRequiredCount,
    blockedCount,
    noActivityCount,
    notApplicableCount,
    unsupportedCount,
    consistencyIssueCount: consistencyIssues.length,
    blockingIssueCount,
  };
}

/**
 * Pure, deterministic assembler. No I/O, no `Date.now`, no float. Derives
 * `declarationExercise = calendarYear + 1` locally, canonically orders modules,
 * requirements and issues, computes summary counts, derives the global status
 * via the frozen precedence, and computes `sourceFingerprint` +
 * `annualFingerprint` (generatedAt excluded).
 */
export function buildUnifiedAnnualIrpfState(
  input: BuildUnifiedAnnualIrpfInput,
): UnifiedAnnualIrpfState {
  const declarationExercise = input.calendarYear + 1;

  const sortedContributions = sortModules(input.modules);
  const modules = sortedContributions.map(toModuleSummary);
  const requirements = aggregateRequirements(input.modules);
  const consistencyIssues = sortConsistencyIssues(input.consistencyIssues);

  const status = deriveUnifiedGlobalStatus(sortedContributions, consistencyIssues);
  const summary = computeSummary(modules, consistencyIssues);

  const sourceFingerprint = computeUnifiedSourceFingerprint({
    calendarYear: input.calendarYear,
    declarationExercise,
    ruleVersions: input.ruleVersions,
    modules: modules.map((m) => ({
      module: m.module,
      sourceFingerprint: m.sourceFingerprint,
      calculationFingerprint: m.calculationFingerprint,
    })),
  });

  const evidenceFingerprints = [
    ...new Set(sortedContributions.flatMap((m) => [...m.evidenceFingerprints])),
  ].sort(compareStrings);

  const annualFingerprint = computeUnifiedAnnualFingerprint({
    calendarYear: input.calendarYear,
    declarationExercise,
    ruleVersions: input.ruleVersions,
    modules: modules.map((m) => ({
      module: m.module,
      status: m.status,
      authoritative: m.authoritative,
      sourceFingerprint: m.sourceFingerprint,
      calculationFingerprint: m.calculationFingerprint,
      blockingReasons: [...m.blockingReasons],
    })),
    evidenceFingerprints,
    consistencyIssues,
    requirements: requirements.map((r) => ({
      key: r.key,
      status: r.status,
      blockingReason: r.blockingReason,
    })),
  });

  const identity: UnifiedAnnualIdentity = {
    calendarYear: input.calendarYear,
    declarationExercise,
    taxSubjectId: input.taxSubjectId,
    ruleVersions: input.ruleVersions,
    generatedAt: input.generatedAt,
    sourceFingerprint,
    annualFingerprint,
    status,
  };

  return {
    identity,
    modules,
    requirements,
    consistencyIssues,
    summary,
  };
}

// Re-export the precedence derivation (declared in the sibling status module),
// imported here to keep a single assembler entry point.
import { deriveUnifiedGlobalStatus } from './unified-annual-status';
export { deriveUnifiedGlobalStatus } from './unified-annual-status';
