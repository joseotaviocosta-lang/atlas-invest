import { describe, expect, it } from 'vitest';
import {
  detectUnifiedConsistencyIssues,
  type ConsistencyInput,
} from '../../packages/tax-engine/src/annual-irpf';

function baseInput(overrides: Partial<ConsistencyInput> = {}): ConsistencyInput {
  return {
    requestedCalendarYear: 2026,
    localDeclarationExercise: 2027,
    moduleIdentities: [
      { module: 'CAPITAL_MARKETS', calendarYear: 2026, declarationExercise: 2027 },
      { module: 'INVESTMENT_INCOME', calendarYear: 2026, declarationExercise: 2027 },
      { module: 'READINESS_EVIDENCE', calendarYear: 2026, declarationExercise: 2027 },
      { module: 'HIGH_INCOME_MINIMUM_TAX', calendarYear: 2026, declarationExercise: 2027 },
    ],
    highIncome: {
      upstreamIncomeFingerprint: 'inc-fp',
      upstreamCapitalMarketFingerprint: 'cap-fp',
      upstreamIncomeStatus: 'READY',
      payerIds: ['PETR4'],
      hasConflictingEvidence: false,
      hasStaleRequiredEvidence: false,
      forcedUpstreamSnapshotInconsistent: false,
    },
    incomeFingerprint: 'inc-fp',
    capitalMarketFingerprint: 'cap-fp',
    incomePayerIds: ['PETR4'],
    hasStaleRequiredConfirmation: false,
    ...overrides,
  };
}

describe('Phase 4J.1 — consistency engine', () => {
  it('no issues when everything is coherent', () => {
    expect(detectUnifiedConsistencyIssues(baseInput())).toHaveLength(0);
  });

  it('YEAR_MISMATCH is BLOCKING', () => {
    const issues = detectUnifiedConsistencyIssues(
      baseInput({
        moduleIdentities: [
          { module: 'CAPITAL_MARKETS', calendarYear: 2025, declarationExercise: 2027 },
        ],
      }),
    );
    expect(issues.some((i) => i.code === 'YEAR_MISMATCH' && i.severity === 'BLOCKING')).toBe(true);
  });

  it('EXERCISE_MISMATCH when a module disagrees with the local derivation', () => {
    const issues = detectUnifiedConsistencyIssues(
      baseInput({
        moduleIdentities: [
          { module: 'INVESTMENT_INCOME', calendarYear: 2026, declarationExercise: 2026 },
        ],
      }),
    );
    expect(issues.some((i) => i.code === 'EXERCISE_MISMATCH')).toBe(true);
  });

  it('SOURCE_FINGERPRINT_MISMATCH on income provenance skew', () => {
    const issues = detectUnifiedConsistencyIssues(baseInput({ incomeFingerprint: 'inc-fp-REV2' }));
    const match = issues.find((i) => i.code === 'SOURCE_FINGERPRINT_MISMATCH');
    expect(match).toBeDefined();
    expect(match?.modules).toContain('INVESTMENT_INCOME');
  });

  it('SOURCE_FINGERPRINT_MISMATCH on capital-market provenance skew', () => {
    const issues = detectUnifiedConsistencyIssues(
      baseInput({ capitalMarketFingerprint: 'cap-fp-REV2' }),
    );
    const match = issues.find(
      (i) => i.code === 'SOURCE_FINGERPRINT_MISMATCH' && i.modules.includes('CAPITAL_MARKETS'),
    );
    expect(match).toBeDefined();
  });

  it('PAYER_IDENTITY_MISMATCH on payer-set divergence (identity only)', () => {
    const issues = detectUnifiedConsistencyIssues(
      baseInput({ incomePayerIds: ['PETR4', 'VALE3'] }),
    );
    expect(issues.some((i) => i.code === 'PAYER_IDENTITY_MISMATCH')).toBe(true);
  });

  it('CONFLICTING_EVIDENCE when 4I evidence conflicts', () => {
    const base = baseInput();
    const issues = detectUnifiedConsistencyIssues({
      ...base,
      highIncome: { ...base.highIncome!, hasConflictingEvidence: true },
    });
    expect(issues.some((i) => i.code === 'CONFLICTING_EVIDENCE')).toBe(true);
  });

  it('UPSTREAM_NOT_READY when upstream income is BLOCKED', () => {
    const base = baseInput();
    const issues = detectUnifiedConsistencyIssues({
      ...base,
      highIncome: { ...base.highIncome!, upstreamIncomeStatus: 'BLOCKED' },
    });
    expect(issues.some((i) => i.code === 'UPSTREAM_NOT_READY')).toBe(true);
  });

  it('STALE_CONFIRMATION on readiness side independent of high-income', () => {
    const issues = detectUnifiedConsistencyIssues(
      baseInput({ hasStaleRequiredConfirmation: true }),
    );
    expect(issues.some((i) => i.code === 'STALE_CONFIRMATION')).toBe(true);
  });

  it('provenance/payer checks are SKIPPED (not failed) when high-income is not applicable', () => {
    const issues = detectUnifiedConsistencyIssues(
      baseInput({
        highIncome: null,
        incomeFingerprint: null,
        capitalMarketFingerprint: null,
      }),
    );
    expect(issues.filter((i) => i.code === 'SOURCE_FINGERPRINT_MISMATCH')).toHaveLength(0);
    expect(issues.filter((i) => i.code === 'PAYER_IDENTITY_MISMATCH')).toHaveLength(0);
  });

  it('never emits ANNUAL_AMOUNT_MISMATCH by default', () => {
    const issues = detectUnifiedConsistencyIssues(
      baseInput({ incomePayerIds: ['PETR4', 'ITUB4'] }),
    );
    expect(issues.some((i) => i.code === 'ANNUAL_AMOUNT_MISMATCH')).toBe(false);
  });

  it('details carry no raw UUIDs or financial amounts', () => {
    const issues = detectUnifiedConsistencyIssues(baseInput({ incomeFingerprint: 'x' }));
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    for (const issue of issues) {
      expect(issue.detail).not.toMatch(uuid);
      expect(issue.detail).not.toMatch(/R\$|\d+[.,]\d{2}/);
    }
  });
});
