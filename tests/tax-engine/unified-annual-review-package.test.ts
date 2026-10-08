import { describe, expect, it } from 'vitest';
import {
  buildUnifiedAnnualReviewPackage,
  computeUnifiedAnnualReviewPackageFingerprint,
  exportUnifiedAnnualReviewPackageToCsv,
  serializeUnifiedAnnualReviewPackageToJson,
  UNIFIED_ANNUAL_REVIEW_BANNER,
  UNIFIED_ANNUAL_REVIEW_PACKAGE_VERSION,
  UnifiedAnnualReviewFilingRegistry,
  type UnifiedAnnualIrpfState,
} from '../../packages/tax-engine/src/annual-irpf';
import { buildState, makeModule } from './unified-annual-helpers';

function packageOf(state: UnifiedAnnualIrpfState, generatedAt = '2027-04-10T00:00:00.000Z') {
  return buildUnifiedAnnualReviewPackage(state, { generatedAt });
}

function readyState() {
  return buildState([
    makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
    makeModule({ module: 'CAPITAL_MARKETS', status: 'READY' }),
    makeModule({ module: 'INVESTMENT_INCOME', status: 'READY' }),
    makeModule({ module: 'READINESS_EVIDENCE', status: 'READY' }),
    makeModule({
      module: 'HIGH_INCOME_MINIMUM_TAX',
      status: 'NOT_APPLICABLE',
      material: false,
    }),
  ]);
}

describe('Phase 4J.2 — unified annual review package (unit)', () => {
  it('exposes the frozen package version and support-only banner', () => {
    expect(UNIFIED_ANNUAL_REVIEW_PACKAGE_VERSION).toBe('unified-annual-review-package-v1');
    expect(UNIFIED_ANNUAL_REVIEW_BANNER).toBe(
      'DOCUMENTO DE APOIO — NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL',
    );
  });

  it('copies the 4J.1 global status verbatim (never more optimistic)', () => {
    for (const [modules, expected] of [
      [[makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' })], 'READY_FOR_REVIEW'],
      [[makeModule({ module: 'ANNUAL_POSITIONS', status: 'BLOCKED' })], 'BLOCKED'],
      [[makeModule({ module: 'ANNUAL_POSITIONS', status: 'PARTIAL' })], 'PARTIAL'],
    ] as const) {
      const pkg = packageOf(buildState([...modules]));
      expect(pkg.status).toBe(expected);
      expect(pkg.sectionBReadiness.globalStatus).toBe(expected);
    }
  });

  it('blocked annual state can never yield a ready package', () => {
    const pkg = packageOf(
      buildState(
        [
          makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' }),
          makeModule({ module: 'CAPITAL_MARKETS', status: 'BLOCKED' }),
        ],
        {
          consistencyIssues: [
            {
              code: 'SOURCE_FINGERPRINT_MISMATCH',
              severity: 'BLOCKING',
              modules: ['CAPITAL_MARKETS', 'HIGH_INCOME_MINIMUM_TAX'],
              detail: 'drift',
            },
          ],
        },
      ),
    );
    expect(pkg.status).toBe('BLOCKED');
    expect(pkg.sectionBReadiness.blockingIssueCount).toBe(1);
  });

  it('builds all eight sections with provenance and disclaimer', () => {
    const pkg = packageOf(readyState());
    expect(pkg.status).toBe('READY_FOR_REVIEW');
    expect(pkg.sectionAIdentity.calendarYear).toBe(2026);
    expect(pkg.sectionAIdentity.declarationExercise).toBe(2027);
    expect(pkg.sectionAIdentity.packageVersion).toBe(UNIFIED_ANNUAL_REVIEW_PACKAGE_VERSION);
    expect(pkg.sectionCModules.modules).toHaveLength(1 + 4);
    expect(pkg.sectionBReadiness.moduleCount).toBe(5);
    expect(pkg.sectionBReadiness.readyCount).toBe(4);
    expect(pkg.sectionBReadiness.notApplicableCount).toBe(1);
    expect(pkg.sectionGProvenance.annualFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(pkg.sectionGProvenance.packageFingerprint).toBe(pkg.packageFingerprint);
    expect(pkg.disclaimer).toContain('NÃO É ARQUIVO OFICIAL DA RECEITA FEDERAL');
    expect(pkg.disclaimer).toContain('2026');
    expect(pkg.sectionHDisclaimer.text).toBe(pkg.disclaimer);
    // No internal subject id anywhere in the serialized package.
    expect(JSON.stringify(pkg)).not.toContain('user-1');
  });

  it('maps requirement rows with blocking flags, actions and deep links', () => {
    const pkg = packageOf(
      buildState([
        makeModule({
          module: 'READINESS_EVIDENCE',
          status: 'REQUIRES_CONFIRMATION',
          requirements: [
            {
              key: 'READINESS_EVIDENCE::TAXPAYER_CONFIRMATIONS::_annual_::TAXPAYER_CONFIRMATIONS',
              module: 'READINESS_EVIDENCE',
              category: 'TAXPAYER_CONFIRMATIONS',
              nativeType: 'TAXPAYER_CONFIRMATIONS',
              subjectReference: '_annual_',
              status: 'PENDING',
              blockingReason: null,
            },
          ],
        }),
      ]),
    );
    expect(pkg.sectionDRequirements.requirements).toHaveLength(1);
    const row = pkg.sectionDRequirements.requirements[0]!;
    expect(row.blocking).toBe(true);
    expect(row.recommendedAction).toContain('confirmar');
    expect(pkg.sectionBReadiness.requirementCount).toBe(1);
  });

  it('explains consistency issues without auto-fixing them', () => {
    const pkg = packageOf(
      buildState([makeModule({ module: 'ANNUAL_POSITIONS', status: 'READY' })], {
        consistencyIssues: [
          {
            code: 'YEAR_MISMATCH',
            severity: 'BLOCKING',
            modules: ['CAPITAL_MARKETS'],
            detail: 'drifted report',
          },
        ],
      }),
    );
    const row = pkg.sectionEConsistency.issues[0]!;
    expect(row.blocking).toBe(true);
    expect(row.explanation.length).toBeGreaterThan(0);
    expect(row.recommendedAction.length).toBeGreaterThan(0);
    expect(pkg.status).toBe('BLOCKED');
  });

  it('filing registry emits zero verified official mappings', () => {
    const notes = UnifiedAnnualReviewFilingRegistry.getNotes();
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.filter((n) => n.mappingStatus === 'VERIFIED_OFFICIAL_MAPPING')).toHaveLength(0);
    expect(notes.some((n) => n.mappingStatus === 'GENERAL_SUPPORT')).toBe(true);
  });

  it('generatedAt change preserves the fingerprint; annualFingerprint change moves it', () => {
    const state = readyState();
    const a = packageOf(state, '2027-04-10T00:00:00.000Z');
    const b = packageOf(state, '2027-09-01T00:00:00.000Z');
    expect(b.packageFingerprint).toBe(a.packageFingerprint);
    expect(b.generatedAt).not.toBe(a.generatedAt);
    const altered = buildState(
      state.modules.map((m) => ({
        module: m.module,
        source: m.source,
        status: m.status,
        authoritative: m.authoritative,
        material: true,
        blockingReasons: [...m.blockingReasons],
        requirements: [...m.requirements],
        sourceFingerprint: `${m.sourceFingerprint}-rev2`,
        calculationFingerprint: m.calculationFingerprint,
        evidenceFingerprints: [],
        declarationExercise: null,
      })),
    );
    const c = packageOf(altered);
    expect(c.packageFingerprint).not.toBe(a.packageFingerprint);
  });

  it('module/requirement/issue shuffle preserves the fingerprint', () => {
    const forward = packageOf(readyState());
    const reversed = buildUnifiedAnnualReviewPackage(
      {
        ...readyState(),
        modules: [...readyState().modules].reverse(),
        requirements: [...readyState().requirements].reverse(),
        consistencyIssues: [...readyState().consistencyIssues].reverse(),
      },
      { generatedAt: '2027-04-10T00:00:00.000Z' },
    );
    expect(reversed.packageFingerprint).toBe(forward.packageFingerprint);
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it('JSON serialization preserves null/zero/fingerprint exactness', () => {
    const pkg = packageOf(readyState());
    const parsed = JSON.parse(serializeUnifiedAnnualReviewPackageToJson(pkg)) as typeof pkg;
    expect(parsed.packageFingerprint).toBe(pkg.packageFingerprint);
    expect(parsed.sectionCModules.modules[0]!.calculationFingerprint).toBe(null);
    expect(parsed.status).toBe(pkg.status);
  });

  it('CSV export carries the banner, CRLF, escaping and SIM/NAO booleans', () => {
    const pkg = packageOf(readyState());
    const csv = exportUnifiedAnnualReviewPackageToCsv(pkg);
    expect(csv).toContain(UNIFIED_ANNUAL_REVIEW_BANNER);
    expect(csv).toContain('\r\n');
    expect(csv).toContain('SECAO A - IDENTIDADE ANUAL');
    expect(csv).toContain('SECAO H - AVISO LEGAL');
    expect(csv).toContain('SIM');
    // OWASP: a hostile subject display would be neutralized (unit-level proof
    // via the shared escaper is covered by csv-escape tests; here assert the
    // header never starts a formula row).
    for (const line of csv.split('\r\n')) {
      if (line.startsWith('#') || line === '') continue;
      expect(line[0]).not.toMatch(/^[=+\-@]/);
    }
  });

  it('computeUnifiedAnnualReviewPackageFingerprint is a pure SHA-256 over canonical content', () => {
    const pkg = packageOf(readyState());
    // Reconstruct the EXACT canonical fingerprint input shape (module rows
    // without `source`; requirement rows without `deepLink`; issues without
    // explanations; notes as 3-field projections).
    const recomputed = computeUnifiedAnnualReviewPackageFingerprint({
      packageVersion: pkg.packageVersion,
      calendarYear: pkg.sectionAIdentity.calendarYear,
      declarationExercise: pkg.sectionAIdentity.declarationExercise,
      annualFingerprint: pkg.sectionGProvenance.annualFingerprint,
      ruleVersions: pkg.sectionGProvenance.ruleVersions,
      modules: pkg.sectionCModules.modules.map((m) => ({
        module: m.module,
        status: m.status,
        authoritative: m.authoritative,
        blockingReasons: [...m.blockingReasons],
        requirementsCount: m.requirementsCount,
        sourceFingerprint: m.sourceFingerprint,
        calculationFingerprint: m.calculationFingerprint,
        deepLink: m.deepLink,
      })),
      requirements: pkg.sectionDRequirements.requirements.map((r) => ({
        key: r.key,
        module: r.module,
        category: r.category,
        subjectDisplay: r.subjectDisplay,
        status: r.status,
        blocking: r.blocking,
        blockingReason: r.blockingReason,
        recommendedAction: r.recommendedAction,
      })),
      consistencyIssues: pkg.sectionEConsistency.issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        modules: [...i.modules],
        blocking: i.blocking,
      })),
      filingNotes: pkg.sectionFFilingSupport.notes.map((n) => ({
        mappingStatus: n.mappingStatus,
        legalReference: n.legalReference,
        text: n.text,
      })),
    });
    expect(recomputed).toBe(pkg.packageFingerprint);
  });
});
