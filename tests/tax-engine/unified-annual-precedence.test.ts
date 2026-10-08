import { describe, expect, it } from 'vitest';
import {
  deriveUnifiedGlobalStatus,
  maxUnifiedStatus,
  type UnifiedConsistencyIssue,
  type UnifiedModuleStatus,
} from '../../packages/tax-engine/src/annual-irpf';
import { buildState, makeModule } from './unified-annual-helpers';

const BLOCKING_ISSUE: UnifiedConsistencyIssue = {
  code: 'SOURCE_FINGERPRINT_MISMATCH',
  severity: 'BLOCKING',
  modules: ['INVESTMENT_INCOME', 'HIGH_INCOME_MINIMUM_TAX'],
  detail: 'test blocking',
};

describe('Phase 4J.1 — unified annual global status precedence (frozen)', () => {
  it('maxUnifiedStatus respects BLOCKED > REQUIRES_ACTION > PARTIAL > READY_FOR_REVIEW > NO_ACTIVITY', () => {
    expect(maxUnifiedStatus('BLOCKED', 'READY_FOR_REVIEW')).toBe('BLOCKED');
    expect(maxUnifiedStatus('REQUIRES_ACTION', 'PARTIAL')).toBe('REQUIRES_ACTION');
    expect(maxUnifiedStatus('PARTIAL', 'READY_FOR_REVIEW')).toBe('PARTIAL');
    expect(maxUnifiedStatus('READY_FOR_REVIEW', 'NO_ACTIVITY')).toBe('READY_FOR_REVIEW');
    expect(maxUnifiedStatus('NO_ACTIVITY', 'NO_ACTIVITY')).toBe('NO_ACTIVITY');
  });

  it('any module BLOCKED -> global BLOCKED (never degrades to PARTIAL)', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'PARTIAL' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'BLOCKED' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'NOT_APPLICABLE' }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('BLOCKED');
  });

  it('any BLOCKING consistency issue -> global BLOCKED even with all-READY modules', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'READY' }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [BLOCKING_ISSUE])).toBe('BLOCKED');
  });

  it('REQUIRES_CONFIRMATION -> REQUIRES_ACTION', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'REQUIRES_CONFIRMATION' }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('REQUIRES_ACTION');
  });

  it('PARTIAL (no action, no blocking) -> PARTIAL', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'PARTIAL' }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('PARTIAL');
  });

  it('passive PARTIAL (no requirements, no blocking reason) -> PARTIAL', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({
        module: 'CAPITAL_MARKETS',
        status: 'PARTIAL',
        requirements: [],
        blockingReasons: [],
      }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('PARTIAL');
  });

  it('action-owned PARTIAL (unresolved required requirement) -> REQUIRES_ACTION', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({
        module: 'READINESS_EVIDENCE',
        status: 'PARTIAL',
        requirements: [
          {
            key: 'READINESS_EVIDENCE::TAXPAYER_CONFIRMATIONS::x::TAXPAYER_CONFIRMATIONS',
            module: 'READINESS_EVIDENCE',
            category: 'TAXPAYER_CONFIRMATIONS',
            nativeType: 'TAXPAYER_CONFIRMATIONS',
            subjectReference: 'x',
            status: 'PENDING',
            blockingReason: null,
          },
        ],
      }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('REQUIRES_ACTION');
  });

  it('action-owned PARTIAL (non-null blocking reason) -> REQUIRES_ACTION', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({
        module: 'CAPITAL_MARKETS',
        status: 'PARTIAL',
        blockingReasons: ['SOME_NATIVE_BLOCKING_MARKER'],
      }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('REQUIRES_ACTION');
  });

  it('a satisfied/waived requirement on a PARTIAL module stays passive PARTIAL', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({
        module: 'CAPITAL_MARKETS',
        status: 'PARTIAL',
        requirements: [
          {
            key: 'CAPITAL_MARKETS::X::y::X',
            module: 'CAPITAL_MARKETS',
            category: 'X',
            nativeType: 'X',
            subjectReference: 'y',
            status: 'SATISFIED',
            blockingReason: null,
          },
        ],
      }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('PARTIAL');
  });

  it('all READY/NO_ACTIVITY/NOT_APPLICABLE, coherent -> READY_FOR_REVIEW', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({ module: 'HIGH_INCOME_MINIMUM_TAX', status: 'NOT_APPLICABLE' }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('READY_FOR_REVIEW');
  });

  it('every module NO_ACTIVITY/NOT_APPLICABLE -> NO_ACTIVITY', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'NO_ACTIVITY' }),
      makeModule({
        module: 'HIGH_INCOME_MINIMUM_TAX',
        status: 'NOT_APPLICABLE',
        material: false,
      }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('NO_ACTIVITY');
  });

  it('NOT_APPLICABLE and NO_ACTIVITY modules do not by themselves block a READY', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({
        module: 'HIGH_INCOME_MINIMUM_TAX',
        status: 'NOT_APPLICABLE',
        material: false,
      }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('READY_FOR_REVIEW');
  });

  it('material UNSUPPORTED module cannot be READY_FOR_REVIEW', () => {
    const withOtherState = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'UNSUPPORTED', material: true }),
    ];
    expect(deriveUnifiedGlobalStatus(withOtherState, [])).toBe('REQUIRES_ACTION');
  });

  it('a sole material UNSUPPORTED fact -> global UNSUPPORTED', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'UNSUPPORTED', material: true }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'NO_ACTIVITY' }),
      makeModule({
        module: 'HIGH_INCOME_MINIMUM_TAX',
        status: 'NOT_APPLICABLE',
        material: false,
      }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('UNSUPPORTED');
  });

  it('pre-2026 empty subject: non-material UNSUPPORTED HIGH_INCOME does not keep the package out of NO_ACTIVITY', () => {
    // Frozen 4I returns UNSUPPORTED_YEAR before 2026; the service marks the
    // module non-material. The four general-annual modules are inert, so the
    // package is NO_ACTIVITY — NOT a false READY_FOR_REVIEW.
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'NO_ACTIVITY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'NO_ACTIVITY' }),
      makeModule({
        module: 'HIGH_INCOME_MINIMUM_TAX',
        status: 'UNSUPPORTED',
        material: false,
      }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('NO_ACTIVITY');
  });

  it('non-material BLOCKED HIGH_INCOME (pre-2026 fence race) never forces the general package to BLOCKED', () => {
    // A pre-2026 4I evidence-fence race maps HIGH_INCOME to a non-material
    // BLOCKED module. It must NOT drag an otherwise-READY general annual
    // package to BLOCKED. The forced consistency UPSTREAM_NOT_READY issue is
    // suppressed upstream for a non-material module, so no blocking issue is
    // passed here.
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
      makeModule({
        module: 'HIGH_INCOME_MINIMUM_TAX',
        status: 'BLOCKED',
        material: false,
        blockingReasons: ['UPSTREAM_SNAPSHOT_INCONSISTENT'],
      }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('READY_FOR_REVIEW');
  });

  it('non-material PARTIAL/REQUIRES_CONFIRMATION HIGH_INCOME does not drive the global status', () => {
    const base = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
      makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
    ];
    for (const nonMaterialStatus of ['PARTIAL', 'REQUIRES_CONFIRMATION'] as const) {
      const modules = [
        ...base,
        makeModule({
          module: 'HIGH_INCOME_MINIMUM_TAX',
          status: nonMaterialStatus,
          material: false,
        }),
      ];
      expect(deriveUnifiedGlobalStatus(modules, [])).toBe('READY_FOR_REVIEW');
    }
  });

  it('a material BLOCKED module still fails closed to global BLOCKED (no collapse)', () => {
    const modules = [
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({
        module: 'HIGH_INCOME_MINIMUM_TAX',
        status: 'BLOCKED',
        material: true,
      }),
    ];
    expect(deriveUnifiedGlobalStatus(modules, [])).toBe('BLOCKED');
  });

  it('status is exposed on the assembled identity', () => {
    const state = buildState([
      makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
      makeModule({ module: 'READINESS_EVIDENCE', status: 'BLOCKED' }),
    ]);
    expect(state.identity.status).toBe('BLOCKED');
  });

  it('exhaustive: a single BLOCKED module dominates any other-module status', () => {
    const others: UnifiedModuleStatus[] = [
      'READY',
      'PARTIAL',
      'REQUIRES_CONFIRMATION',
      'NO_ACTIVITY',
      'NOT_APPLICABLE',
      'UNSUPPORTED',
    ];
    for (const other of others) {
      const modules = [
        makeModule({ module: 'ANNUAL_POSITIONS', status: 'BLOCKED' }),
        makeModule({ module: 'CAPITAL_MARKETS', status: other, material: true }),
      ];
      expect(deriveUnifiedGlobalStatus(modules, [])).toBe('BLOCKED');
    }
  });
});
