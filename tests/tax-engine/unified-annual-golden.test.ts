import { describe, expect, it } from 'vitest';
import type {
  UnifiedAnnualStatus,
  UnifiedConsistencyIssue,
} from '../../packages/tax-engine/src/annual-irpf';
import { buildState, makeModule } from './unified-annual-helpers';

interface GoldenScenario {
  readonly name: string;
  readonly modules: Parameters<typeof buildState>[0];
  readonly issues: readonly UnifiedConsistencyIssue[];
  readonly expectedGlobal: UnifiedAnnualStatus;
}

const SCENARIOS: readonly GoldenScenario[] = [
  {
    name: '4H READY + 4I NOT_APPLICABLE -> READY_FOR_REVIEW',
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({
        module: 'HIGH_INCOME_MINIMUM_TAX',
        status: 'NOT_APPLICABLE',
        material: false,
      }),
    ],
    issues: [],
    expectedGlobal: 'READY_FOR_REVIEW',
  },
  {
    name: 'both READY -> READY_FOR_REVIEW',
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'READY' }),
    ],
    issues: [],
    expectedGlobal: 'READY_FOR_REVIEW',
  },
  {
    name: '4H READY + 4I BLOCKED -> BLOCKED',
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({
        module: 'HIGH_INCOME_MINIMUM_TAX',
        status: 'BLOCKED',
        blockingReasons: ['UPSTREAM_SNAPSHOT_INCONSISTENT'],
      }),
    ],
    issues: [],
    expectedGlobal: 'BLOCKED',
  },
  {
    name: '4H BLOCKED + 4I READY -> BLOCKED',
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'BLOCKED' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'READY' }),
    ],
    issues: [],
    expectedGlobal: 'BLOCKED',
  },
  {
    name: '4H PARTIAL + 4I READY -> PARTIAL',
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'PARTIAL' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'READY' }),
    ],
    issues: [],
    expectedGlobal: 'PARTIAL',
  },
  {
    name: '4H READY + 4I REQUIRES_CONFIRMATION -> REQUIRES_ACTION',
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'REQUIRES_CONFIRMATION' }),
    ],
    issues: [],
    expectedGlobal: 'REQUIRES_ACTION',
  },
  {
    name: 'both NO_ACTIVITY -> NO_ACTIVITY',
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'NO_ACTIVITY' }),
      makeModule({
        module: 'HIGH_INCOME_MINIMUM_TAX',
        status: 'NOT_APPLICABLE',
        material: false,
      }),
    ],
    issues: [],
    expectedGlobal: 'NO_ACTIVITY',
  },
  {
    name: 'unsupported material module -> UNSUPPORTED',
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'UNSUPPORTED', material: true }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'NO_ACTIVITY' }),
      makeModule({
        module: 'HIGH_INCOME_MINIMUM_TAX',
        status: 'NOT_APPLICABLE',
        material: false,
      }),
    ],
    issues: [],
    expectedGlobal: 'UNSUPPORTED',
  },
  {
    name: 'fingerprint skew (SOURCE_FINGERPRINT_MISMATCH BLOCKING) -> BLOCKED',
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'READY' }),
    ],
    issues: [
      {
        code: 'SOURCE_FINGERPRINT_MISMATCH',
        severity: 'BLOCKING',
        modules: ['INVESTMENT_INCOME', 'HIGH_INCOME_MINIMUM_TAX'],
        detail: 'skew',
      },
    ],
    expectedGlobal: 'BLOCKED',
  },
  {
    name: 'stale confirmation (STALE_CONFIRMATION BLOCKING) -> BLOCKED',
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'REQUIRES_CONFIRMATION' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'READY' }),
    ],
    issues: [
      {
        code: 'STALE_CONFIRMATION',
        severity: 'BLOCKING',
        modules: ['READINESS_EVIDENCE'],
        detail: 'stale',
      },
    ],
    expectedGlobal: 'BLOCKED',
  },
  {
    name: 'conflicting evidence (CONFLICTING_EVIDENCE BLOCKING) -> BLOCKED',
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'REQUIRES_CONFIRMATION' }),
    ],
    issues: [
      {
        code: 'CONFLICTING_EVIDENCE',
        severity: 'BLOCKING',
        modules: ['HIGH_INCOME_MINIMUM_TAX'],
        detail: 'conflict',
      },
    ],
    expectedGlobal: 'BLOCKED',
  },
  {
    name: 'payer identity skew (PAYER_IDENTITY_MISMATCH BLOCKING) -> BLOCKED',
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'READY' }),
    ],
    issues: [
      {
        code: 'PAYER_IDENTITY_MISMATCH',
        severity: 'BLOCKING',
        modules: ['INVESTMENT_INCOME', 'HIGH_INCOME_MINIMUM_TAX'],
        detail: 'orphan payer in high income',
      },
    ],
    expectedGlobal: 'BLOCKED',
  },
  {
    name: 'benign payer asymmetry (no issue emitted) -> READY_FOR_REVIEW',
    // A diversified high-income filer: 4H.4 carries payers 4I never references.
    // The one-directional detector emits NOTHING, so the package stays READY.
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'READY' }),
    ],
    issues: [],
    expectedGlobal: 'READY_FOR_REVIEW',
  },
  {
    name: 'action-owned partial (unresolved required requirement) -> REQUIRES_ACTION',
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({
        module: 'HIGH_INCOME_MINIMUM_TAX',
        status: 'PARTIAL',
        requirements: [
          {
            key: 'HIGH_INCOME_MINIMUM_TAX::CORPORATE_EFFECTIVE_TAX_EVIDENCE::_annual_::CORPORATE_EFFECTIVE_TAX_EVIDENCE',
            module: 'HIGH_INCOME_MINIMUM_TAX',
            category: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
            nativeType: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE',
            subjectReference: '_annual_',
            status: 'PENDING',
            blockingReason: 'CORPORATE_EFFECTIVE_TAX_EVIDENCE_PENDING',
          },
        ],
      }),
    ],
    issues: [],
    expectedGlobal: 'REQUIRES_ACTION',
  },
  {
    name: 'out-of-window high income absent (NOT_APPLICABLE, 4H READY) -> READY_FOR_REVIEW',
    // Pre-2026 calendar year: high-income is NOT_APPLICABLE + immaterial; it must
    // not block an otherwise-ready general annual package.
    modules: [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({
        module: 'HIGH_INCOME_MINIMUM_TAX',
        status: 'NOT_APPLICABLE',
        material: false,
      }),
    ],
    issues: [],
    expectedGlobal: 'READY_FOR_REVIEW',
  },
];

/**
 * Pinned literal golden outputs. Semantic drift (a status mapping, precedence,
 * fingerprint-input or canonicalization change) breaks these exact-match
 * assertions, so production and tests cannot silently drift together. The
 * fingerprints are computed with the fixed helper defaults
 * (calendarYear 2026, generatedAt excluded) and are reproducible.
 */
const GOLDEN_FINGERPRINTS: Readonly<Record<string, string>> = {
  '4H READY + 4I NOT_APPLICABLE -> READY_FOR_REVIEW':
    'b550cebef45dc41257e8fe5e441e37e877d4e17a505fe1ac447e9e9fdc2b6a63',
  'both READY -> READY_FOR_REVIEW':
    'ef564f23e932034c7864c1af3a4c5b77d6ce33701c54f81fa1199a1dc4e0e203',
  '4H READY + 4I BLOCKED -> BLOCKED':
    '9714d3e2373bb301c7f64e389824b3d916b152044eb5b65adcd90d98ae5c6dd7',
  '4H BLOCKED + 4I READY -> BLOCKED':
    '0c188d2d01317a9fec0d1909ef46c1c21a37fbc6d50fd0b646eb805dd1f1d34f',
  '4H PARTIAL + 4I READY -> PARTIAL':
    '382fd8c159b34739e21babc667d80314b9cc6353749bcaee7ad6f0116d3327f6',
  '4H READY + 4I REQUIRES_CONFIRMATION -> REQUIRES_ACTION':
    '02985b3045d380827e8dc33bdd9933eb35c2454989945264f12d6db1c28eaa3b',
  'both NO_ACTIVITY -> NO_ACTIVITY':
    'd0f401f4a0acfcada5e35192176b404d00aad048af7f827841910e91aac4ac99',
  'unsupported material module -> UNSUPPORTED':
    'd3dcf966e429209ce6462f10d74377389151312bd4460bfbe0f39fd4e840effa',
  'fingerprint skew (SOURCE_FINGERPRINT_MISMATCH BLOCKING) -> BLOCKED':
    'd226d1ba59a4abdd97c15c356e757e604775c302fef91fdced3deb7ca2bd109d',
  'stale confirmation (STALE_CONFIRMATION BLOCKING) -> BLOCKED':
    'fad817a7e9a11bf5045e26b634956ed99ba8ad35c4594f361fcbfc6d8a616dc7',
  'conflicting evidence (CONFLICTING_EVIDENCE BLOCKING) -> BLOCKED':
    '4e94f8275cd0bade75674b38dbd479eaecda3f31d287f4719c1dc18a20e1a8bb',
  'payer identity skew (PAYER_IDENTITY_MISMATCH BLOCKING) -> BLOCKED':
    '95420e2b3983017a1182057bedfd8177710e2527eeca5116b2bda479198d67c9',
  'benign payer asymmetry (no issue emitted) -> READY_FOR_REVIEW':
    'ef564f23e932034c7864c1af3a4c5b77d6ce33701c54f81fa1199a1dc4e0e203',
  'action-owned partial (unresolved required requirement) -> REQUIRES_ACTION':
    '324f3f533b8e37f51515252e327131d5c158e8d83cb07bd6f67ee4b0c615c9a5',
  'out-of-window high income absent (NOT_APPLICABLE, 4H READY) -> READY_FOR_REVIEW':
    'b550cebef45dc41257e8fe5e441e37e877d4e17a505fe1ac447e9e9fdc2b6a63',
};

describe('Phase 4J.1 — cross-regime golden matrix', () => {
  it.each(SCENARIOS)(
    '$name — global status, module statuses & consistency codes pinned',
    (scenario) => {
      const state = buildState(scenario.modules, { consistencyIssues: scenario.issues });
      expect(state.identity.status).toBe(scenario.expectedGlobal);

      // Pin the exact per-module status set (canonical module order).
      const expectedModuleStatuses = scenario.modules
        .slice()
        .sort((a, b) => a.module.localeCompare(b.module));
      const actualByModule = new Map(state.modules.map((m) => [m.module, m.status]));
      for (const expected of expectedModuleStatuses) {
        expect(actualByModule.get(expected.module)).toBe(expected.status);
      }

      // Pin the exact set of consistency codes.
      const expectedCodes = [...scenario.issues.map((i) => i.code)].sort();
      const actualCodes = [...state.consistencyIssues.map((i) => i.code)].sort();
      expect(actualCodes).toEqual(expectedCodes);
    },
  );

  it('each golden scenario pins its literal annualFingerprint', () => {
    for (const scenario of SCENARIOS) {
      const state = buildState(scenario.modules, { consistencyIssues: scenario.issues });
      const pinned = GOLDEN_FINGERPRINTS[scenario.name];
      expect(pinned, `missing golden pin for "${scenario.name}"`).toBeDefined();
      expect(
        state.identity.annualFingerprint,
        `golden fingerprint drift for "${scenario.name}"`,
      ).toBe(pinned);
    }
  });

  it('each golden scenario produces a stable, reproducible annualFingerprint', () => {
    for (const scenario of SCENARIOS) {
      const a = buildState(scenario.modules, { consistencyIssues: scenario.issues });
      const b = buildState(scenario.modules, { consistencyIssues: scenario.issues });
      expect(a.identity.annualFingerprint).toBe(b.identity.annualFingerprint);
      expect(a.identity.annualFingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('structurally-distinct golden scenarios produce distinct annualFingerprints', () => {
    // Two scenarios are intentionally content-identical to earlier ones (they
    // differ only in BEHAVIOURAL narrative, not in module/issue content): the
    // benign payer asymmetry mirrors "both READY" and the out-of-window absent
    // case mirrors the NOT_APPLICABLE case. The content fingerprint MUST collide
    // for those, so they are excluded from the distinctness assertion.
    const CONTENT_ALIASES = new Set<string>([
      'benign payer asymmetry (no issue emitted) -> READY_FOR_REVIEW',
      'out-of-window high income absent (NOT_APPLICABLE, 4H READY) -> READY_FOR_REVIEW',
    ]);
    const fingerprints = SCENARIOS.filter((s) => !CONTENT_ALIASES.has(s.name)).map(
      (s) => buildState(s.modules, { consistencyIssues: s.issues }).identity.annualFingerprint,
    );
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('behavioural-alias scenarios collide with their content twins (fingerprint is content-only)', () => {
    const fp = (name: string) => {
      const s = SCENARIOS.find((x) => x.name === name)!;
      return buildState(s.modules, { consistencyIssues: s.issues }).identity.annualFingerprint;
    };
    expect(fp('benign payer asymmetry (no issue emitted) -> READY_FOR_REVIEW')).toBe(
      fp('both READY -> READY_FOR_REVIEW'),
    );
    expect(
      fp('out-of-window high income absent (NOT_APPLICABLE, 4H READY) -> READY_FOR_REVIEW'),
    ).toBe(fp('4H READY + 4I NOT_APPLICABLE -> READY_FOR_REVIEW'));
  });
});
