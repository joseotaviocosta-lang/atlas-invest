/**
 * Phase 4J.1 — strict runtime response validation for the unified annual wire.
 *
 * A shallow top-level check is NOT enough: a response missing `summary` or
 * carrying malformed module/requirement/issue entries would pass and then crash
 * during render. These guards validate the full shape so a malformed payload
 * deterministically falls back to the "resposta inválida" fail-safe instead of
 * throwing in the component tree. Pure (no React) so it is directly unit-tested.
 */

export interface UnifiedRequirementWire {
  readonly key: string;
  readonly module: string;
  readonly category: string;
  readonly nativeType: string;
  readonly subjectReference: string;
  readonly status: string;
  readonly blockingReason: string | null;
}

export interface UnifiedModuleWire {
  readonly module: string;
  readonly source: string;
  readonly status: string;
  readonly authoritative: boolean;
  readonly blockingReasons: readonly string[];
  readonly requirements: readonly UnifiedRequirementWire[];
  readonly sourceFingerprint: string;
  readonly calculationFingerprint: string | null;
}

export interface UnifiedConsistencyWire {
  readonly code: string;
  readonly severity: string;
  readonly modules: readonly string[];
  readonly detail: string;
}

export interface UnifiedAnnualSummaryWire {
  readonly moduleCount: number;
  readonly readyCount: number;
  readonly actionRequiredCount: number;
  readonly blockedCount: number;
  readonly consistencyIssueCount: number;
  readonly blockingIssueCount: number;
}

export interface UnifiedAnnualWire {
  readonly calendarYear: number;
  readonly declarationExercise: number;
  readonly status: string;
  readonly summary: UnifiedAnnualSummaryWire;
  readonly modules: readonly UnifiedModuleWire[];
  readonly requirements: readonly UnifiedRequirementWire[];
  readonly consistencyIssues: readonly UnifiedConsistencyWire[];
  readonly sourceFingerprint: string;
  readonly annualFingerprint: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isValidSummary(value: unknown): value is UnifiedAnnualSummaryWire {
  if (!isObject(value)) return false;
  return (
    typeof value.moduleCount === 'number' &&
    typeof value.readyCount === 'number' &&
    typeof value.actionRequiredCount === 'number' &&
    typeof value.blockedCount === 'number' &&
    typeof value.consistencyIssueCount === 'number' &&
    typeof value.blockingIssueCount === 'number'
  );
}

export function isValidRequirement(value: unknown): value is UnifiedRequirementWire {
  if (!isObject(value)) return false;
  return (
    typeof value.key === 'string' &&
    typeof value.module === 'string' &&
    typeof value.category === 'string' &&
    typeof value.nativeType === 'string' &&
    typeof value.subjectReference === 'string' &&
    typeof value.status === 'string' &&
    (value.blockingReason === null || typeof value.blockingReason === 'string')
  );
}

export function isValidModule(value: unknown): value is UnifiedModuleWire {
  if (!isObject(value)) return false;
  return (
    typeof value.module === 'string' &&
    typeof value.source === 'string' &&
    typeof value.status === 'string' &&
    typeof value.authoritative === 'boolean' &&
    isStringArray(value.blockingReasons) &&
    Array.isArray(value.requirements) &&
    value.requirements.every(isValidRequirement) &&
    typeof value.sourceFingerprint === 'string' &&
    (value.calculationFingerprint === null || typeof value.calculationFingerprint === 'string')
  );
}

export function isValidConsistencyIssue(value: unknown): value is UnifiedConsistencyWire {
  if (!isObject(value)) return false;
  return (
    typeof value.code === 'string' &&
    typeof value.severity === 'string' &&
    isStringArray(value.modules) &&
    typeof value.detail === 'string'
  );
}

export function isValidWire(value: unknown): value is UnifiedAnnualWire {
  if (!isObject(value)) return false;
  return (
    typeof value.status === 'string' &&
    typeof value.calendarYear === 'number' &&
    typeof value.declarationExercise === 'number' &&
    typeof value.sourceFingerprint === 'string' &&
    typeof value.annualFingerprint === 'string' &&
    isValidSummary(value.summary) &&
    Array.isArray(value.modules) &&
    value.modules.every(isValidModule) &&
    Array.isArray(value.requirements) &&
    value.requirements.every(isValidRequirement) &&
    Array.isArray(value.consistencyIssues) &&
    value.consistencyIssues.every(isValidConsistencyIssue)
  );
}

/**
 * Strict full-segment calendar-year parse. The entire route segment must be a
 * canonical integer string within the supported civil range. Returns null for
 * malformed input (`2026junk`, `02026`, `2026.0`, ` 2026 `, out-of-range) so the
 * caller preserves invalidity rather than silently coercing to a valid year.
 */
export function parseStrictCalendarYear(segment: string): number | null {
  if (!/^-?\d+$/.test(segment)) {
    return null;
  }
  const parsed = Number(segment);
  if (!Number.isInteger(parsed) || String(parsed) !== segment) {
    return null;
  }
  if (parsed < 1900 || parsed > 2100) {
    return null;
  }
  return parsed;
}
