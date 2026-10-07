import { describe, expect, it } from 'vitest';
import {
  stableStringify,
  type UnifiedConsistencyIssue,
  type UnifiedRequirement,
} from '../../packages/tax-engine/src/annual-irpf';
import { buildState, DEFAULT_RULE_VERSIONS, makeModule } from './unified-annual-helpers';

function baseModules() {
  return [
    makeModule({
      module: 'ANNUAL_POSITIONS',
      status: 'READY',
      sourceFingerprint: 'fp-pos',
    }),
    makeModule({
      module: 'CAPITAL_MARKETS',
      status: 'READY',
      sourceFingerprint: 'fp-cap',
    }),
    makeModule({
      module: 'INVESTMENT_INCOME',
      status: 'PARTIAL',
      sourceFingerprint: 'fp-inc',
    }),
    makeModule({
      module: 'READINESS_EVIDENCE',
      status: 'REQUIRES_CONFIRMATION',
      sourceFingerprint: 'fp-rdy',
      evidenceFingerprints: ['ev-1', 'ev-2'],
    }),
    makeModule({
      module: 'HIGH_INCOME_MINIMUM_TAX',
      status: 'READY',
      sourceFingerprint: 'fp-hi',
      calculationFingerprint: 'calc-hi',
    }),
  ];
}

describe('Phase 4J.1 — unified annual fingerprint', () => {
  it('same input -> same annualFingerprint', () => {
    const a = buildState(baseModules());
    const b = buildState(baseModules());
    expect(a.identity.annualFingerprint).toBe(b.identity.annualFingerprint);
  });

  it('generatedAt change does NOT change the fingerprint', () => {
    const a = buildState(baseModules(), { generatedAt: '2027-04-01T00:00:00.000Z' });
    const b = buildState(baseModules(), { generatedAt: '2050-12-31T00:00:00.000Z' });
    expect(a.identity.annualFingerprint).toBe(b.identity.annualFingerprint);
    expect(a.identity.sourceFingerprint).toBe(b.identity.sourceFingerprint);
  });

  it('module-order shuffle -> identical fingerprint', () => {
    const normal = baseModules();
    const shuffled = [...normal].reverse();
    const a = buildState(normal);
    const b = buildState(shuffled);
    expect(a.identity.annualFingerprint).toBe(b.identity.annualFingerprint);
  });

  it('requirement-order shuffle -> identical fingerprint', () => {
    const r1: UnifiedRequirement = {
      key: 'READINESS_EVIDENCE::A::x::A',
      module: 'READINESS_EVIDENCE',
      category: 'A',
      nativeType: 'A',
      subjectReference: 'x',
      status: 'PENDING',
      blockingReason: null,
    };
    const r2: UnifiedRequirement = {
      key: 'READINESS_EVIDENCE::B::y::B',
      module: 'READINESS_EVIDENCE',
      category: 'B',
      nativeType: 'B',
      subjectReference: 'y',
      status: 'PENDING',
      blockingReason: null,
    };
    const a = buildState([
      makeModule({ module: 'READINESS_EVIDENCE', status: 'PARTIAL', requirements: [r1, r2] }),
    ]);
    const b = buildState([
      makeModule({ module: 'READINESS_EVIDENCE', status: 'PARTIAL', requirements: [r2, r1] }),
    ]);
    expect(a.identity.annualFingerprint).toBe(b.identity.annualFingerprint);
  });

  it('a changed module status DOES change the fingerprint', () => {
    const a = buildState(baseModules());
    const changed = baseModules().map((m) =>
      m.module === 'INVESTMENT_INCOME' ? { ...m, status: 'BLOCKED' as const } : m,
    );
    const b = buildState(changed);
    expect(a.identity.annualFingerprint).not.toBe(b.identity.annualFingerprint);
  });

  it('a changed module sourceFingerprint (source revision) DOES change the fingerprint', () => {
    const a = buildState(baseModules());
    const changed = baseModules().map((m) =>
      m.module === 'CAPITAL_MARKETS' ? { ...m, sourceFingerprint: 'fp-cap-REV2' } : m,
    );
    const b = buildState(changed);
    expect(a.identity.annualFingerprint).not.toBe(b.identity.annualFingerprint);
    expect(a.identity.sourceFingerprint).not.toBe(b.identity.sourceFingerprint);
  });

  it('a new evidence revision DOES change the fingerprint', () => {
    const a = buildState(baseModules());
    const changed = baseModules().map((m) =>
      m.module === 'READINESS_EVIDENCE'
        ? { ...m, evidenceFingerprints: ['ev-1', 'ev-2', 'ev-3'] }
        : m,
    );
    const b = buildState(changed);
    expect(a.identity.annualFingerprint).not.toBe(b.identity.annualFingerprint);
  });

  it('a changed consistency set DOES change the fingerprint', () => {
    const issue: UnifiedConsistencyIssue = {
      code: 'CONFLICTING_EVIDENCE',
      severity: 'BLOCKING',
      modules: ['HIGH_INCOME_MINIMUM_TAX'],
      detail: 'conflict',
    };
    const a = buildState(baseModules());
    const b = buildState(baseModules(), { consistencyIssues: [issue] });
    expect(a.identity.annualFingerprint).not.toBe(b.identity.annualFingerprint);
  });

  it('sourceFingerprint is a subset of annualFingerprint sensitivity (calculationFingerprint change moves both)', () => {
    const a = buildState(baseModules());
    const changed = baseModules().map((m) =>
      m.module === 'HIGH_INCOME_MINIMUM_TAX' ? { ...m, calculationFingerprint: 'calc-REV2' } : m,
    );
    const b = buildState(changed);
    expect(a.identity.sourceFingerprint).not.toBe(b.identity.sourceFingerprint);
    expect(a.identity.annualFingerprint).not.toBe(b.identity.annualFingerprint);
  });

  it('stableStringify pins null and undefined serialization deterministically', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(undefined)).toBe('null');
    expect(stableStringify({ a: null, b: undefined })).toBe('{"a":null,"b":null}');
    // The three honest-null ruleVersions must serialize deterministically.
    expect(stableStringify(DEFAULT_RULE_VERSIONS)).toBe(
      '{"annualPositions":null,"capitalMarkets":null,"highIncome":null,"investmentIncome":null,"readinessEvidence":null}',
    );
  });

  it('ruleVersions values feed the fingerprint deterministically', () => {
    const a = buildState(baseModules(), {
      ruleVersions: { ...DEFAULT_RULE_VERSIONS, highIncome: 'v1' },
    });
    const b = buildState(baseModules(), {
      ruleVersions: { ...DEFAULT_RULE_VERSIONS, highIncome: 'v2' },
    });
    expect(a.identity.annualFingerprint).not.toBe(b.identity.annualFingerprint);
  });
});
