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
];

describe('Phase 4J.1 — cross-regime golden matrix', () => {
  it.each(SCENARIOS)('$name', (scenario) => {
    const state = buildState(scenario.modules, { consistencyIssues: scenario.issues });
    expect(state.identity.status).toBe(scenario.expectedGlobal);
  });

  it('each golden scenario produces a stable, reproducible annualFingerprint', () => {
    for (const scenario of SCENARIOS) {
      const a = buildState(scenario.modules, { consistencyIssues: scenario.issues });
      const b = buildState(scenario.modules, { consistencyIssues: scenario.issues });
      expect(a.identity.annualFingerprint).toBe(b.identity.annualFingerprint);
      expect(a.identity.annualFingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('distinct golden scenarios produce distinct annualFingerprints', () => {
    const fingerprints = SCENARIOS.map(
      (s) => buildState(s.modules, { consistencyIssues: s.issues }).identity.annualFingerprint,
    );
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });
});
