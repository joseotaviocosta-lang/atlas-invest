import { createHash } from 'crypto';
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

// Deterministic LCG (mirrors unified-annual-property-fuzz.test.ts, seed fixed).
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
const SUBJECTS = ['_annual_', 'petr4', 'vale3', 'itub4'] as const;
const NATIVE_TYPES = [
  'TAXPAYER_CONFIRMATIONS',
  'OPENING_POSITIONS',
  'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
  'ANNUAL_INCOME_TOTAL',
  'CUSTOM_CODE',
] as const;
const ISSUE_CODES = [
  'YEAR_MISMATCH',
  'EXERCISE_MISMATCH',
  'SOURCE_FINGERPRINT_MISMATCH',
  'PAYER_IDENTITY_MISMATCH',
  'STALE_CONFIRMATION',
  'CONFLICTING_EVIDENCE',
  'UPSTREAM_NOT_READY',
  'ANNUAL_AMOUNT_MISMATCH',
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
      code: rng.choice(ISSUE_CODES),
      severity: rng.bool(0.7) ? 'BLOCKING' : 'WARNING',
      modules: [a, b],
      detail: `detail-${rng.nextInt(0, 9999)}`,
    });
  }
  return issues;
}

function randomState(rng: DeterministicRandom): UnifiedAnnualIrpfState {
  const modules = MODULE_IDS.map((module) =>
    makeModule({
      module,
      status: rng.choice(MODULE_STATUSES),
      material: rng.bool(0.8),
      blockingReasons: rng.bool(0.2) ? ['REASON_X'] : [],
      requirements: randomRequirements(rng, module),
      sourceFingerprint: `fp-${rng.nextInt(0, 999999)}`,
      calculationFingerprint: rng.bool(0.2) ? `calc-${rng.nextInt(0, 999)}` : null,
    }),
  );
  // Random input order (assembler must canonicalize).
  for (let i = modules.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    const tmp = modules[i]!;
    modules[i] = modules[j]!;
    modules[j] = tmp;
  }
  return buildState(modules, {
    calendarYear: rng.choice([2024, 2025, 2026, 2027]),
    consistencyIssues: randomIssues(rng),
  });
}

/**
 * Independent differential reference: re-derives the expected package status
 * (verbatim 4J.1 status) and recomputes the fingerprint with a separately
 * written canonicalization (own sort + own stable stringify + own sha256).
 * Must agree with production on every case.
 */
function stableStringifyRef(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringifyRef).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringifyRef(v)}`);
  return `{${entries.join(',')}}`;
}

const MODULE_ORDER_REF: readonly string[] = [...MODULE_IDS];

function referenceFingerprint(pkg: ReturnType<typeof buildUnifiedAnnualReviewPackage>): string {
  const modules = [...pkg.sectionCModules.modules].sort(
    (a, b) => MODULE_ORDER_REF.indexOf(a.module) - MODULE_ORDER_REF.indexOf(b.module),
  );
  const requirements = [...pkg.sectionDRequirements.requirements].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
  const issues = [...pkg.sectionEConsistency.issues].sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    if (a.severity !== b.severity) return a.severity < b.severity ? -1 : 1;
    const am = a.modules.join(',');
    const bm = b.modules.join(',');
    if (am !== bm) return am < bm ? -1 : 1;
    return 0;
  });
  const canonical = {
    packageVersion: pkg.packageVersion,
    calendarYear: pkg.sectionAIdentity.calendarYear,
    declarationExercise: pkg.sectionAIdentity.declarationExercise,
    annualFingerprint: pkg.sectionGProvenance.annualFingerprint,
    ruleVersions: pkg.sectionGProvenance.ruleVersions,
    modules: modules.map((m) => ({
      module: m.module,
      status: m.status,
      authoritative: m.authoritative,
      blockingReasons: [...m.blockingReasons].sort(),
      requirementsCount: m.requirementsCount,
      sourceFingerprint: m.sourceFingerprint,
      calculationFingerprint: m.calculationFingerprint,
      deepLink: m.deepLink,
    })),
    requirements: requirements.map((r) => ({
      key: r.key,
      module: r.module,
      category: r.category,
      subjectDisplay: r.subjectDisplay,
      status: r.status,
      blocking: r.blocking,
      blockingReason: r.blockingReason,
      recommendedAction: r.recommendedAction,
    })),
    consistencyIssues: issues.map((i) => ({
      code: i.code,
      severity: i.severity,
      // Canonical member order is module-order (not alphabetical), mirroring
      // production's canonicalization with an independently written comparator.
      modules: [...i.modules].sort((a, b) => {
        const order = MODULE_ORDER_REF.indexOf(a) - MODULE_ORDER_REF.indexOf(b);
        if (order !== 0) return order;
        return a < b ? -1 : a > b ? 1 : 0;
      }),
      blocking: i.blocking,
    })),
    filingNotes: [...pkg.sectionFFilingSupport.notes].map((n) => ({
      mappingStatus: n.mappingStatus,
      legalReference: n.legalReference,
      text: n.text,
    })),
  };
  return createHash('sha256').update(stableStringifyRef(canonical), 'utf8').digest('hex');
}

describe('Phase 4J.2 — package assembly fuzz & differential', () => {
  it('fuzz: 20000 deterministic cases run FULL package assembly + fingerprint and hold all invariants', () => {
    const rng = new DeterministicRandom(4210731);
    const iterations = 20000;
    for (let n = 0; n < iterations; n++) {
      const state = randomState(rng);
      const pkg = buildUnifiedAnnualReviewPackage(state, {
        generatedAt: '2027-04-10T00:00:00.000Z',
      });
      // Invariants on every case.
      expect(pkg.packageVersion).toBe(UNIFIED_ANNUAL_REVIEW_PACKAGE_VERSION);
      expect(pkg.status).toBe(state.identity.status);
      expect(pkg.sectionBReadiness.globalStatus).toBe(state.identity.status);
      expect(pkg.packageFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(pkg.sectionGProvenance.packageFingerprint).toBe(pkg.packageFingerprint);
      expect(pkg.sectionGProvenance.annualFingerprint).toBe(state.identity.annualFingerprint);
      expect(pkg.disclaimer).toContain('NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL');
      expect(pkg.sectionHDisclaimer.text).toBe(pkg.disclaimer);
      expect(pkg.sectionCModules.modules).toHaveLength(state.modules.length);
      expect(pkg.sectionBReadiness.requirementCount).toBe(
        pkg.sectionDRequirements.requirements.length,
      );
      // No NaN/Infinity/float coercion: JSON round-trip is exact.
      const roundTripped = JSON.parse(JSON.stringify(pkg)) as typeof pkg;
      expect(roundTripped.packageFingerprint).toBe(pkg.packageFingerprint);
      // Blocking 4J.1 state never yields a READY package.
      if (state.identity.status === 'BLOCKED') {
        expect(pkg.status).not.toBe('READY_FOR_REVIEW');
      }
      // Serialized body never leaks the internal subject id.
      expect(JSON.stringify(pkg)).not.toContain('user-1');
      // Zero verified official mappings in every case.
      for (const note of pkg.sectionFFilingSupport.notes) {
        expect(note.mappingStatus).not.toBe('VERIFIED_OFFICIAL_MAPPING');
      }
    }
  }, 120000);

  it('differential: reference status + fingerprint agree with production on 20000 cases', () => {
    const rng = new DeterministicRandom(777001);
    let mismatches = 0;
    for (let n = 0; n < 20000; n++) {
      const state = randomState(rng);
      const pkg = buildUnifiedAnnualReviewPackage(state, {
        generatedAt: '2027-04-10T00:00:00.000Z',
      });
      if (pkg.status !== state.identity.status) mismatches++;
      if (referenceFingerprint(pkg) !== pkg.packageFingerprint) mismatches++;
    }
    expect(mismatches).toBe(0);
  }, 120000);
});
