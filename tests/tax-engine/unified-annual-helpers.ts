import {
  buildUnifiedAnnualIrpfState,
  type BuildUnifiedAnnualIrpfInput,
  type UnifiedModuleContribution,
  type UnifiedModuleId,
  type UnifiedModuleSource,
  type UnifiedModuleStatus,
  type UnifiedRequirement,
  type UnifiedRuleVersions,
} from '../../packages/tax-engine/src/annual-irpf';

export const MODULE_SOURCE: Record<UnifiedModuleId, UnifiedModuleSource> = {
  ANNUAL_POSITIONS: '4H.2',
  CAPITAL_MARKETS: '4H.3',
  INVESTMENT_INCOME: '4H.4',
  READINESS_EVIDENCE: '4H.5',
  HIGH_INCOME_MINIMUM_TAX: '4I',
};

export const DEFAULT_RULE_VERSIONS: UnifiedRuleVersions = {
  annualPositions: null,
  capitalMarkets: null,
  investmentIncome: null,
  readinessEvidence: null,
  highIncome: null,
};

export interface ModuleOverride {
  readonly module: UnifiedModuleId;
  readonly status: UnifiedModuleStatus;
  readonly material?: boolean;
  readonly authoritative?: boolean;
  readonly blockingReasons?: readonly string[];
  readonly requirements?: readonly UnifiedRequirement[];
  readonly sourceFingerprint?: string;
  readonly calculationFingerprint?: string | null;
  readonly evidenceFingerprints?: readonly string[];
  readonly declarationExercise?: number | null;
}

export function makeModule(override: ModuleOverride): UnifiedModuleContribution {
  return {
    module: override.module,
    source: MODULE_SOURCE[override.module],
    status: override.status,
    authoritative: override.authoritative ?? override.status === 'READY',
    material: override.material ?? true,
    blockingReasons: override.blockingReasons ?? [],
    requirements: override.requirements ?? [],
    sourceFingerprint: override.sourceFingerprint ?? `fp-${override.module}-${override.status}`,
    calculationFingerprint: override.calculationFingerprint ?? null,
    evidenceFingerprints: override.evidenceFingerprints ?? [],
    declarationExercise: override.declarationExercise ?? null,
  };
}

export function buildState(
  modules: readonly UnifiedModuleContribution[],
  options: Partial<BuildUnifiedAnnualIrpfInput> = {},
) {
  const input: BuildUnifiedAnnualIrpfInput = {
    calendarYear: options.calendarYear ?? 2026,
    taxSubjectId: options.taxSubjectId ?? 'user-1',
    generatedAt: options.generatedAt ?? '2027-04-01T00:00:00.000Z',
    ruleVersions: options.ruleVersions ?? DEFAULT_RULE_VERSIONS,
    modules,
    consistencyIssues: options.consistencyIssues ?? [],
  };
  return buildUnifiedAnnualIrpfState(input);
}
