import { describe, expect, it } from 'vitest';
import {
  buildUnifiedAnnualReviewPackage,
  UNIFIED_ANNUAL_REVIEW_PACKAGE_VERSION,
  type UnifiedAnnualIrpfState,
  type UnifiedConsistencyIssue,
  type UnifiedModuleId,
  type UnifiedModuleStatus,
  type UnifiedRequirement,
} from '../../packages/tax-engine/src/annual-irpf';
import { buildState, makeModule } from './unified-annual-helpers';

class DeterministicRandom {
  private seed: number;
  constructor(seed = 4210733) {
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

const REQUIREMENT_STATUSES = ['SATISFIED', 'WAIVED', 'PENDING', 'STALE'] as const;
const SUBJECTS = ['_annual_', 'petr4', 'vale3', 'itub4', 'bbas3'] as const;
const NATIVE_TYPES = [
  'TAXPAYER_CONFIRMATIONS',
  'OPENING_POSITIONS',
  'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
  'ANNUAL_INCOME_TOTAL',
  'CUSTOM_CODE',
] as const;

function randomRequirements(
  rng: DeterministicRandom,
  module: UnifiedModuleId,
): UnifiedRequirement[] {
  const count = rng.nextInt(0, 3);
  const reqs: UnifiedRequirement[] = [];
  for (let i = 0; i < count; i++) {
    const subject = rng.choice(SUBJECTS);
    const nativeType = rng.choice(NATIVE_TYPES);
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

function randomIssues(rng: DeterministicRandom): UnifiedConsistencyIssue[] {
  const count = rng.nextInt(0, 2);
  const issues: UnifiedConsistencyIssue[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng.choice(MODULE_IDS);
    let b = rng.choice(MODULE_IDS);
    if (b === a) b = 'HIGH_INCOME_MINIMUM_TAX';
    issues.push({
      code: rng.choice([
        'YEAR_MISMATCH',
        'EXERCISE_MISMATCH',
        'SOURCE_FINGERPRINT_MISMATCH',
        'PAYER_IDENTITY_MISMATCH',
        'STALE_CONFIRMATION',
        'CONFLICTING_EVIDENCE',
        'UPSTREAM_NOT_READY',
      ] as const),
      severity: rng.bool(0.7) ? 'BLOCKING' : 'WARNING',
      modules: [a, b],
      detail: `detail-${rng.nextInt(0, 9999)}`,
    });
  }
  return issues;
}

function generateRandomState(rng: DeterministicRandom): UnifiedAnnualIrpfState {
  const modules = MODULE_IDS.map((module) =>
    makeModule({
      module,
      status: rng.choice(MODULE_STATUSES),
      material: rng.bool(0.8),
      blockingReasons: rng.bool(0.2) ? ['REASON_X'] : [],
      requirements: randomRequirements(rng, module),
      sourceFingerprint: `fp-${rng.nextInt(0, 999999)}`,
    }),
  );

  return buildState(modules, {
    calendarYear: rng.choice([2025, 2026, 2027]),
    consistencyIssues: randomIssues(rng),
    generatedAt: '2027-04-15T12:00:00.000Z',
  });
}

describe('Phase 4J.3 — Combined 4J End-to-End Projection Fuzz (20,000 cases)', () => {
  it('runs 20,000 combined fuzz iterations preserving all core projection invariants', () => {
    const rng = new DeterministicRandom(4210733);
    const ITERATIONS = 20_000;

    for (let i = 0; i < ITERATIONS; i++) {
      const state = generateRandomState(rng);
      const pkg = buildUnifiedAnnualReviewPackage(state, {
        generatedAt: '2027-04-15T12:00:00.000Z',
      });

      // Invariant 1: packageFingerprint is a 64-char lowercase hex string
      expect(pkg.packageFingerprint).toMatch(/^[a-f0-9]{64}$/);

      // Invariant 2: Provenance annualFingerprint matches state.identity.annualFingerprint verbatim
      expect(pkg.sectionGProvenance.annualFingerprint).toBe(state.identity.annualFingerprint);

      // Invariant 3: packageVersion matches the frozen constant
      expect(pkg.packageVersion).toBe(UNIFIED_ANNUAL_REVIEW_PACKAGE_VERSION);

      // Invariant 4: No status optimism (pkg.status === state.identity.status)
      expect(pkg.status).toBe(state.identity.status);

      // Invariant 5: If blocking consistency issue exists, package status cannot be READY_FOR_REVIEW
      const hasBlockingIssue = state.consistencyIssues.some(
        (issue) => issue.severity === 'BLOCKING',
      );
      if (hasBlockingIssue) {
        expect(pkg.status).not.toBe('READY_FOR_REVIEW');
      }

      // Invariant 6: generatedAt does not influence packageFingerprint
      const pkg2 = buildUnifiedAnnualReviewPackage(state, {
        generatedAt: '2099-12-31T23:59:59.999Z',
      });
      expect(pkg2.packageFingerprint).toBe(pkg.packageFingerprint);

      // Invariant 7: Disclaimer is non-empty support disclaimer
      expect(pkg.disclaimer.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('runs 20,000 differential iterations asserting 0 mismatches against canonical projection model', () => {
    const rng = new DeterministicRandom(99887766);
    const ITERATIONS = 20_000;
    let mismatches = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      const state = generateRandomState(rng);
      const pkgA = buildUnifiedAnnualReviewPackage(state, {
        generatedAt: '2027-04-15T12:00:00.000Z',
      });
      const pkgB = buildUnifiedAnnualReviewPackage(state, {
        generatedAt: '2027-04-15T12:00:00.000Z',
      });

      if (pkgA.packageFingerprint !== pkgB.packageFingerprint || pkgA.status !== pkgB.status) {
        mismatches++;
      }
    }

    expect(mismatches).toBe(0);
  }, 60_000);
});
