import { describe, expect, it } from 'vitest';
import {
  deriveUnifiedGlobalStatus,
  detectUnifiedConsistencyIssues,
  type ConsistencyInput,
  type UnifiedAnnualStatus,
  type UnifiedConsistencyIssue,
  type UnifiedModuleContribution,
  type UnifiedModuleId,
  type UnifiedModuleStatus,
  type UnifiedRequirement,
} from '../../packages/tax-engine/src/annual-irpf';
import { buildState, makeModule } from './unified-annual-helpers';

// Deterministic LCG (mirrors annual-irpf-final-fuzz.test.ts).
class DeterministicRandom {
  private seed: number;
  constructor(seed = 4210731) {
    this.seed = seed >>> 0;
  }
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  choice<T>(arr: readonly T[]): T {
    return arr[this.nextInt(0, arr.length - 1)]!;
  }
  bool(p = 0.5): boolean {
    return this.next() < p;
  }
}

const MODULE_IDS: readonly UnifiedModuleId[] = [
  'ANNUAL_POSITIONS',
  'CAPITAL_MARKETS',
  'INVESTMENT_INCOME',
  'READINESS_EVIDENCE',
  'HIGH_INCOME_MINIMUM_TAX',
];

const MODULE_STATUSES: readonly UnifiedModuleStatus[] = [
  'READY',
  'PARTIAL',
  'REQUIRES_CONFIRMATION',
  'BLOCKED',
  'NO_ACTIVITY',
  'NOT_APPLICABLE',
  'UNSUPPORTED',
];

const REQUIREMENT_STATUSES = ['SATISFIED', 'WAIVED', 'PENDING', 'STALE', 'WEIRD'] as const;
const PAYERS = ['PETR4', 'VALE3', 'ITUB4', 'HGLG11', 'FOOX'] as const;

/**
 * Independent reference aggregator (minimal, separate implementation) used for
 * the differential test. Must agree with the production fold on every case.
 * Mirrors the frozen precedence AND the action-owned-partial escalation so the
 * differential genuinely checks the production fold, not a copy of it.
 */
function referenceGlobalStatus(
  modules: readonly UnifiedModuleContribution[],
  issues: readonly UnifiedConsistencyIssue[],
): UnifiedAnnualStatus {
  const blockingIssue = issues.some((i) => i.severity === 'BLOCKING');
  if (blockingIssue) return 'BLOCKED';

  // Decisive precedence branches inspect MATERIAL modules only: a non-material
  // module (pre-2026 HIGH_INCOME, a non-material fence race) must never drive
  // the global status. Mirrors the frozen production fold.
  const material = modules.filter((m) => m.material);
  if (material.some((m) => m.status === 'BLOCKED')) return 'BLOCKED';
  if (material.some((m) => m.status === 'REQUIRES_CONFIRMATION')) return 'REQUIRES_ACTION';

  const materialUnsupported = material.filter((m) => m.status === 'UNSUPPORTED');
  if (materialUnsupported.length > 0) {
    const otherMaterialWithState = material.some(
      (m) =>
        m.status !== 'UNSUPPORTED' && m.status !== 'NO_ACTIVITY' && m.status !== 'NOT_APPLICABLE',
    );
    return otherMaterialWithState ? 'REQUIRES_ACTION' : 'UNSUPPORTED';
  }

  const unresolved = (r: UnifiedRequirement) => r.status !== 'SATISFIED' && r.status !== 'WAIVED';
  const actionOwned = material.some(
    (m) =>
      (m.status === 'PARTIAL' || m.status === 'READY' || m.status === 'NO_ACTIVITY') &&
      (m.blockingReasons.length > 0 || m.requirements.some(unresolved)),
  );
  if (actionOwned) return 'REQUIRES_ACTION';

  if (material.some((m) => m.status === 'PARTIAL')) return 'PARTIAL';
  if (material.every((m) => m.status === 'NO_ACTIVITY' || m.status === 'NOT_APPLICABLE')) {
    return 'NO_ACTIVITY';
  }
  return 'READY_FOR_REVIEW';
}

function randomRequirements(
  rng: DeterministicRandom,
  module: UnifiedModuleId,
): UnifiedRequirement[] {
  const count = rng.nextInt(0, 3);
  const reqs: UnifiedRequirement[] = [];
  for (let i = 0; i < count; i++) {
    const subject = rng.choice(['_annual_', ...PAYERS.map((p) => p.toLowerCase())]);
    const nativeType = rng.choice(['TAXPAYER_CONFIRMATIONS', 'CORPORATE_EFFECTIVE_TAX_EVIDENCE']);
    reqs.push({
      key: `${module}::${nativeType}::${subject}::${nativeType}`,
      module,
      category: nativeType,
      nativeType,
      subjectReference: subject,
      status: rng.choice(REQUIREMENT_STATUSES),
      blockingReason: rng.bool(0.3) ? 'SOME_REASON' : null,
    });
  }
  return reqs;
}

function randomModules(rng: DeterministicRandom): UnifiedModuleContribution[] {
  return MODULE_IDS.map((module) => {
    const status = rng.choice(MODULE_STATUSES);
    return makeModule({
      module,
      status,
      material: rng.bool(0.8),
      blockingReasons: rng.bool(0.2) ? ['MODULE_LOAD_FAILED'] : [],
      requirements: randomRequirements(rng, module),
      sourceFingerprint: `fp-${module}-${status}-${rng.nextInt(0, 9)}`,
      calculationFingerprint:
        module === 'HIGH_INCOME_MINIMUM_TAX' && rng.bool() ? `calc-${rng.nextInt(0, 9)}` : null,
      evidenceFingerprints: rng.bool(0.3) ? [`ev-${rng.nextInt(0, 50)}`] : [],
    });
  });
}

/**
 * Build a random ConsistencyInput and run it THROUGH the real detector so the
 * fuzz exercises the adapter + payer/evidence/provenance logic (not prebuilt
 * issues). The returned issues are the detector's real output.
 */
function randomDetectedIssues(rng: DeterministicRandom): UnifiedConsistencyIssue[] {
  const year = 2026;
  const hiPresent = rng.bool(0.7);
  const hiPayerCount = rng.nextInt(0, 3);
  const hiPayers = Array.from({ length: hiPayerCount }, () => rng.choice(PAYERS));
  const incomePayerCount = rng.nextInt(0, 4);
  const incomePayers = Array.from({ length: incomePayerCount }, () => rng.choice(PAYERS));

  const input: ConsistencyInput = {
    requestedCalendarYear: year,
    localDeclarationExercise: year + 1,
    moduleIdentities: [
      {
        module: 'CAPITAL_MARKETS',
        calendarYear: rng.bool(0.9) ? year : year - 1,
        declarationExercise: rng.bool(0.9) ? year + 1 : year,
      },
      { module: 'INVESTMENT_INCOME', calendarYear: year, declarationExercise: year + 1 },
    ],
    highIncome: hiPresent
      ? {
          upstreamIncomeFingerprint: rng.bool(0.85) ? 'inc-fp' : 'inc-fp-REV',
          upstreamCapitalMarketFingerprint: rng.bool(0.85) ? 'cap-fp' : 'cap-fp-REV',
          upstreamIncomeStatus: rng.bool(0.85) ? 'READY' : 'BLOCKED',
          payerIds: hiPayers,
          hasConflictingEvidence: rng.bool(0.2),
          hasStaleRequiredEvidence: rng.bool(0.2),
          forcedUpstreamSnapshotInconsistent: false,
        }
      : null,
    incomeFingerprint: hiPresent ? 'inc-fp' : null,
    capitalMarketFingerprint: hiPresent ? 'cap-fp' : null,
    incomePayerIds: incomePayers,
    hasStaleRequiredConfirmation: rng.bool(0.2),
  };
  return [...detectUnifiedConsistencyIssues(input)];
}

describe('Phase 4J.1 — property, fuzz & differential', () => {
  it('property: summary counts equal actual tallies; blockingIssueCount matches', () => {
    const rng = new DeterministicRandom(7);
    for (let i = 0; i < 2000; i++) {
      const modules = randomModules(rng);
      const issues = randomDetectedIssues(rng);
      const state = buildState(modules, { consistencyIssues: issues });

      const tally = (s: UnifiedModuleStatus) => state.modules.filter((m) => m.status === s).length;
      expect(state.summary.moduleCount).toBe(state.modules.length);
      expect(state.summary.readyCount).toBe(tally('READY'));
      expect(state.summary.blockedCount).toBe(tally('BLOCKED'));
      expect(state.summary.noActivityCount).toBe(tally('NO_ACTIVITY'));
      expect(state.summary.notApplicableCount).toBe(tally('NOT_APPLICABLE'));
      expect(state.summary.unsupportedCount).toBe(tally('UNSUPPORTED'));
      expect(state.summary.actionRequiredCount).toBe(
        tally('PARTIAL') + tally('REQUIRES_CONFIRMATION'),
      );
      expect(state.summary.consistencyIssueCount).toBe(state.consistencyIssues.length);
      expect(state.summary.blockingIssueCount).toBe(
        state.consistencyIssues.filter((x) => x.severity === 'BLOCKING').length,
      );
    }
  });

  it('property: a READY global never coexists with a blocking issue or unresolved required evidence', () => {
    const rng = new DeterministicRandom(555);
    for (let i = 0; i < 3000; i++) {
      const modules = randomModules(rng);
      const issues = randomDetectedIssues(rng);
      const state = buildState(modules, { consistencyIssues: issues });
      if (state.identity.status === 'READY_FOR_REVIEW') {
        // No blocking consistency issue.
        expect(state.consistencyIssues.some((x) => x.severity === 'BLOCKING')).toBe(false);
        // No material, PARTICIPATING module (READY / PARTIAL / NO_ACTIVITY) may
        // carry an unresolved required requirement or a non-null blocking reason
        // — those escalate to REQUIRES_ACTION in the fold, so they can never
        // coexist with a READY global. (NOT_APPLICABLE / UNSUPPORTED are handled
        // by the materiality branches above and are not participating here.)
        for (const mod of modules.filter((m) => m.material)) {
          const participating =
            mod.status === 'READY' || mod.status === 'PARTIAL' || mod.status === 'NO_ACTIVITY';
          if (!participating) continue;
          const unresolved = mod.requirements.some(
            (r) => r.status !== 'SATISFIED' && r.status !== 'WAIVED',
          );
          expect(unresolved).toBe(false);
          expect(mod.blockingReasons.length).toBe(0);
        }
      }
    }
  });

  it(
    'fuzz: 20000 deterministic cases run FULL assembly + fingerprint and hold all invariants',
    { timeout: 180000 },
    () => {
      const rng = new DeterministicRandom(20260815);
      const iterations = 20000;
      const CANONICAL_ORDER = [
        'ANNUAL_POSITIONS',
        'CAPITAL_MARKETS',
        'INVESTMENT_INCOME',
        'READINESS_EVIDENCE',
        'HIGH_INCOME_MINIMUM_TAX',
      ];
      for (let i = 0; i < iterations; i++) {
        const modules = randomModules(rng);
        const issues = randomDetectedIssues(rng);

        const hasBlockingIssue = issues.some((x) => x.severity === 'BLOCKING');
        // A non-material BLOCKED module must NOT force a global BLOCKED, so the
        // invariant is scoped to material modules (mirrors the frozen fold).
        const hasBlockedModule = modules.some((m) => m.material && m.status === 'BLOCKED');

        // The pure fold (no hashing) must never throw and must honour the
        // no-collapse invariants.
        const foldStatus = deriveUnifiedGlobalStatus(modules, issues);
        if (hasBlockingIssue || hasBlockedModule) {
          expect(foldStatus).toBe('BLOCKED');
        }
        if (hasBlockingIssue) {
          expect(foldStatus).not.toBe('READY_FOR_REVIEW');
        }

        // FULL orchestration + SHA-256 fingerprint invariant on EVERY one of the
        // 20000 cases (approved >=20000 full-assembly requirement; no sampling).
        const state = buildState(modules, { consistencyIssues: issues });
        expect(state.identity.status).toBe(foldStatus);

        // Canonical module order is always stable.
        expect(state.modules.map((m) => m.module)).toEqual(CANONICAL_ORDER);

        // One combined re-assembly per case simultaneously proves three
        // fingerprint invariants on all 20000 inputs:
        //   - order independence: modules + issues are reversed;
        //   - generatedAt exclusion: a far-future clock is used;
        //   - determinism: an identical canonical content must hash identically.
        const variant = buildState([...modules].reverse(), {
          consistencyIssues: [...issues].reverse(),
          generatedAt: '2099-12-31T00:00:00.000Z',
        });
        expect(variant.identity.annualFingerprint).toBe(state.identity.annualFingerprint);
      }
    },
  );

  it(
    'differential: reference aggregator agrees with production fold on 20000 cases',
    { timeout: 60000 },
    () => {
      const rng = new DeterministicRandom(31337);
      let mismatches = 0;
      for (let i = 0; i < 20000; i++) {
        const modules = randomModules(rng);
        const issues = randomDetectedIssues(rng);
        const production = deriveUnifiedGlobalStatus(modules, issues);
        const reference = referenceGlobalStatus(modules, issues);
        if (production !== reference) mismatches++;
      }
      expect(mismatches).toBe(0);
    },
  );

  it('property: NOT_APPLICABLE/NO_ACTIVITY modules do not falsely block when no blocking and no open actions', () => {
    const rng = new DeterministicRandom(99);
    for (let i = 0; i < 1000; i++) {
      const modules = MODULE_IDS.map((module) =>
        makeModule({
          module,
          status: rng.choice(['READY', 'NO_ACTIVITY', 'NOT_APPLICABLE'] as const),
          material: rng.bool(0.8),
          requirements: [],
          blockingReasons: [],
        }),
      );
      const status = deriveUnifiedGlobalStatus(modules, []);
      expect(['READY_FOR_REVIEW', 'NO_ACTIVITY']).toContain(status);
    }
  });
});
