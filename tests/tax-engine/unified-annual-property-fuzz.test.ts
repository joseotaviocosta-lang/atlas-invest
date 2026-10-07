import { describe, expect, it } from 'vitest';
import {
  deriveUnifiedGlobalStatus,
  type UnifiedAnnualStatus,
  type UnifiedConsistencyIssue,
  type UnifiedModuleContribution,
  type UnifiedModuleId,
  type UnifiedModuleStatus,
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

/**
 * Independent reference aggregator (minimal, separate implementation) used for
 * the differential test. Must agree with the production fold on every case.
 */
function referenceGlobalStatus(
  modules: readonly UnifiedModuleContribution[],
  issues: readonly UnifiedConsistencyIssue[],
): UnifiedAnnualStatus {
  const blockingIssue = issues.some((i) => i.severity === 'BLOCKING');
  if (blockingIssue) return 'BLOCKED';
  if (modules.some((m) => m.status === 'BLOCKED')) return 'BLOCKED';
  if (modules.some((m) => m.status === 'REQUIRES_CONFIRMATION')) return 'REQUIRES_ACTION';

  const materialUnsupported = modules.filter((m) => m.material && m.status === 'UNSUPPORTED');
  if (materialUnsupported.length > 0) {
    const otherMaterialWithState = modules.some(
      (m) =>
        m.material &&
        m.status !== 'UNSUPPORTED' &&
        m.status !== 'NO_ACTIVITY' &&
        m.status !== 'NOT_APPLICABLE',
    );
    return otherMaterialWithState ? 'REQUIRES_ACTION' : 'UNSUPPORTED';
  }

  if (modules.some((m) => m.status === 'PARTIAL')) return 'PARTIAL';
  if (modules.every((m) => m.status === 'NO_ACTIVITY' || m.status === 'NOT_APPLICABLE')) {
    return 'NO_ACTIVITY';
  }
  return 'READY_FOR_REVIEW';
}

function randomModules(rng: DeterministicRandom): UnifiedModuleContribution[] {
  return MODULE_IDS.map((module) => {
    const status = rng.choice(MODULE_STATUSES);
    return makeModule({
      module,
      status,
      material: rng.bool(0.8),
      sourceFingerprint: `fp-${module}-${status}-${rng.nextInt(0, 9)}`,
      calculationFingerprint:
        module === 'HIGH_INCOME_MINIMUM_TAX' && rng.bool() ? `calc-${rng.nextInt(0, 9)}` : null,
      evidenceFingerprints: rng.bool(0.3) ? [`ev-${rng.nextInt(0, 50)}`] : [],
    });
  });
}

function randomIssues(rng: DeterministicRandom): UnifiedConsistencyIssue[] {
  if (!rng.bool(0.3)) return [];
  const count = rng.nextInt(1, 3);
  const issues: UnifiedConsistencyIssue[] = [];
  const codes = [
    'YEAR_MISMATCH',
    'SOURCE_FINGERPRINT_MISMATCH',
    'PAYER_IDENTITY_MISMATCH',
    'CONFLICTING_EVIDENCE',
  ] as const;
  for (let i = 0; i < count; i++) {
    issues.push({
      code: rng.choice(codes),
      severity: rng.bool(0.7) ? 'BLOCKING' : 'WARNING',
      modules: [rng.choice(MODULE_IDS)],
      detail: `issue-${i}`,
    });
  }
  return issues;
}

describe('Phase 4J.1 — property, fuzz & differential', () => {
  it('property: summary counts equal actual tallies; blockingIssueCount matches', () => {
    const rng = new DeterministicRandom(7);
    for (let i = 0; i < 2000; i++) {
      const modules = randomModules(rng);
      const issues = randomIssues(rng);
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

  it(
    'fuzz: 20000 deterministic cases never throw and hold all invariants',
    { timeout: 120000 },
    () => {
      const rng = new DeterministicRandom(20260815);
      const iterations = 20000;
      for (let i = 0; i < iterations; i++) {
        const modules = randomModules(rng);
        const issues = randomIssues(rng);

        const hasBlockingIssue = issues.some((x) => x.severity === 'BLOCKING');
        const hasBlockedModule = modules.some((m) => m.status === 'BLOCKED');

        // Cheap path for every one of the 20000 cases: the pure fold (no hashing)
        // must never throw and must honour the no-collapse invariants.
        const foldStatus = deriveUnifiedGlobalStatus(modules, issues);
        if (hasBlockingIssue || hasBlockedModule) {
          expect(foldStatus).toBe('BLOCKED');
        }
        if (hasBlockingIssue) {
          expect(foldStatus).not.toBe('READY_FOR_REVIEW');
        }

        // Expensive path (full assemble + 4 SHA-256) sampled every 7th case to
        // keep the 20000-case loop within budget alongside the other fuzz suites.
        // The dedicated fingerprint suite exhaustively pins determinism/order.
        if (i % 7 === 0) {
          const state = buildState(modules, { consistencyIssues: issues });
          expect(state.identity.status).toBe(foldStatus);

          const again = buildState(modules, { consistencyIssues: issues });
          expect(again.identity.annualFingerprint).toBe(state.identity.annualFingerprint);

          const shuffled = buildState([...modules].reverse(), {
            consistencyIssues: [...issues].reverse(),
          });
          expect(shuffled.identity.annualFingerprint).toBe(state.identity.annualFingerprint);

          // Canonical module order is always stable.
          expect(state.modules.map((m) => m.module)).toEqual([
            'ANNUAL_POSITIONS',
            'CAPITAL_MARKETS',
            'INVESTMENT_INCOME',
            'READINESS_EVIDENCE',
            'HIGH_INCOME_MINIMUM_TAX',
          ]);
        }
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
        const issues = randomIssues(rng);
        const production = deriveUnifiedGlobalStatus(modules, issues);
        const reference = referenceGlobalStatus(modules, issues);
        if (production !== reference) mismatches++;
      }
      expect(mismatches).toBe(0);
    },
  );

  it('property: NOT_APPLICABLE/NO_ACTIVITY modules do not falsely block when no blocking present', () => {
    const rng = new DeterministicRandom(99);
    for (let i = 0; i < 1000; i++) {
      const modules = MODULE_IDS.map((module) =>
        makeModule({
          module,
          status: rng.choice(['READY', 'NO_ACTIVITY', 'NOT_APPLICABLE'] as const),
          material: rng.bool(0.8),
        }),
      );
      const status = deriveUnifiedGlobalStatus(modules, []);
      expect(['READY_FOR_REVIEW', 'NO_ACTIVITY']).toContain(status);
    }
  });
});
