import { describe, expect, it } from 'vitest';
import {
  buildHighIncomeAnnualReviewPackage,
  exportHighIncomeReviewPackageToCsv,
  serializeHighIncomeReviewPackageToJson,
  HIGH_INCOME_REVIEW_DISCLAIMER,
  HIGH_INCOME_REVIEW_BANNER,
  HIGH_INCOME_REVIEW_PACKAGE_VERSION,
  HighIncomeReviewFilingRegistry,
  exerciseLabel,
  HIGH_INCOME_MINIMUM_TAX_THRESHOLD_METRIC,
  type HighIncomeReviewAssessmentInput,
} from '../../packages/tax-engine/src/annual-irpf';

const GEN_AT = '2027-03-15T12:00:00.000Z';

function baseReadModel(
  overrides: Partial<HighIncomeReviewAssessmentInput> = {},
): HighIncomeReviewAssessmentInput {
  return {
    calendarYear: 2026,
    declarationExercise: 2027,
    ruleVersion: 'irpfm-2026.1',
    status: 'CALCULABLE',
    applicability: 'APPLICABLE',
    totalAnnualIncome: '1200000.00',
    applicabilityThreshold: '600000',
    minimumTaxBase: '1200000.00',
    rateBand: 'BAND_10',
    minimumRatePercentage: '10',
    grossMinimumTax: '120000.00',
    credits: [
      {
        kind: 'IRPF_ORDINARY',
        role: 'CREDIT',
        supported: true,
        provided: true,
        amount: '30000.00',
        applied: true,
        requiredForNet: true,
        legalReference: 'Lei nº 15.270/2025',
        reason: 'ok',
      },
    ],
    supportedCreditsTotal: '30000.00',
    reductions: [
      {
        kind: 'CORPORATE_REDUTOR',
        role: 'REDUCTION',
        supported: true,
        provided: true,
        amount: '5000.00',
        applied: true,
        requiredForNet: false,
        legalReference: 'Lei nº 15.270/2025',
        reason: 'ok',
      },
    ],
    supportedReductionsTotal: '5000.00',
    corporateRedutor: {
      aggregateVersion: 'redutor-v1',
      payerCount: 2,
      computedPayerCount: 2,
      status: 'COMPUTED',
      totalEligibleDividends: '80000.00',
      totalReductionExact: '5000.00',
      totalSupportedReduction: '5000.00',
      payers: [
        {
          payerId: 'PAYER-B',
          payerType: 'CORPORATE',
          status: 'COMPUTED',
          referenceRatePercentage: '34',
          corporateEffectiveRatePercentage: '20',
          pfEffectiveRatePercentage: '10',
          eligibleDividends: '50000.00',
          reductionExact: '3000.00',
          evidenceStatus: 'AUTHORITATIVE',
          blockingReasons: [],
          sourceFingerprint: 'fp-payer-b',
        },
        {
          payerId: 'PAYER-A',
          payerType: 'CORPORATE',
          status: 'COMPUTED',
          referenceRatePercentage: '34',
          corporateEffectiveRatePercentage: '22',
          pfEffectiveRatePercentage: '10',
          eligibleDividends: '30000.00',
          reductionExact: '2000.00',
          evidenceStatus: 'AUTHORITATIVE',
          blockingReasons: [],
          sourceFingerprint: 'fp-payer-a',
        },
      ],
      blockingPayers: [],
      blockingReasons: [],
      sourceFingerprint: 'redutor-source-fp',
      calculationFingerprint: 'redutor-calc-fp',
    },
    netMinimumTax: '85000.00',
    creditExcess: '0.00',
    incomeBreakdown: [
      {
        category: 'DIVIDENDS',
        classification: 'INCLUDED',
        grossAmount: '800000.00',
        includedAmount: '800000.00',
        excludedAmount: '0.00',
        itemCount: 3,
        payerIds: ['PAYER-A', 'PAYER-B'],
        reason: 'included',
        legalReference: 'Lei nº 15.270/2025',
      },
      {
        category: 'JCP',
        classification: 'INCLUDED',
        grossAmount: '400000.00',
        includedAmount: '400000.00',
        excludedAmount: '0.00',
        itemCount: 2,
        payerIds: ['PAYER-A'],
        reason: 'included',
        legalReference: 'Lei nº 9.249/1995',
      },
    ],
    evidenceRequirements: [
      {
        requirementId: 'REQ-1',
        requirement: 'CORPORATE_RATE_EVIDENCE',
        subjectId: 'PAYER-A',
        title: 'Taxa efetiva PJ',
        status: 'SATISFIED',
        legalReference: 'Lei nº 15.270/2025',
        blockingReason: null,
      },
    ],
    evidence: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        evidenceType: 'CORPORATE_RATE',
        payerId: 'PAYER-A',
        authority: 'TAXPAYER',
        evidenceSource: 'UPLOAD',
        conflictStatus: 'NONE',
        stale: false,
        revision: 1,
        supersedesId: null,
        sourceFingerprint: 'ev-source-a',
        fingerprint: 'ev-fp-a',
      },
    ],
    blockingReasons: [],
    limitations: [],
    upstreamIncomeStatus: 'READY',
    upstreamIncomeFingerprint: 'income-fp',
    upstreamCapitalMarketFingerprint: 'cm-fp',
    sourceFingerprint: 'source-fp',
    calculationFingerprint: 'calc-fp',
    ...overrides,
  };
}

describe('Phase 4I.6 — High-Income Review Package assembler (verbatim mapping)', () => {
  it('maps identity verbatim; calendarYear 2026 -> declarationExercise 2027', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(baseReadModel(), { generatedAt: GEN_AT });
    expect(pkg.packageVersion).toBe(HIGH_INCOME_REVIEW_PACKAGE_VERSION);
    expect(pkg.disclaimer).toBe(HIGH_INCOME_REVIEW_DISCLAIMER);
    expect(pkg.generatedAt).toBe(GEN_AT);
    expect(pkg.section1Identity.calendarYear).toBe(2026);
    expect(pkg.section1Identity.declarationExercise).toBe(2027);
    expect(pkg.section1Identity.ruleVersion).toBe('irpfm-2026.1');
    expect(pkg.section1Identity.generatedAt).toBe(GEN_AT);
  });

  it('Section 2 copies verbatim; thresholdMetric uses the frozen engine constant', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(baseReadModel(), { generatedAt: GEN_AT });
    expect(pkg.section2Applicability.status).toBe('APPLICABLE');
    expect(pkg.section2Applicability.totalAnnualIncome).toBe('1200000.00');
    expect(pkg.section2Applicability.eligibilityThreshold).toBe('600000');
    expect(pkg.section2Applicability.thresholdMetric).toBe(
      HIGH_INCOME_MINIMUM_TAX_THRESHOLD_METRIC,
    );
    expect(pkg.section2Applicability.applicable).toBe(true);
  });

  it('Section 4 copies values verbatim and surfaces authoritative net', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(baseReadModel(), { generatedAt: GEN_AT });
    expect(pkg.status).toBe('READY_FOR_REVIEW');
    expect(pkg.section4Calculation.minimumTaxBase).toBe('1200000.00');
    expect(pkg.section4Calculation.grossMinimumTax).toBe('120000.00');
    expect(pkg.section4Calculation.netMinimumTax).toBe('85000.00');
    expect(pkg.section4Calculation.netIsAuthoritative).toBe(true);
    expect(pkg.section4Calculation.corporateRedutorSupportedTotal).toBe('5000.00');
  });

  it('Section 6 payers are sorted by payerId ASC, copied verbatim', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(baseReadModel(), { generatedAt: GEN_AT });
    expect(pkg.section6CorporateRedutorByPayer.present).toBe(true);
    const ids = pkg.section6CorporateRedutorByPayer.payers.map((p) => p.payerId);
    expect(ids).toEqual(['PAYER-A', 'PAYER-B']);
    expect(pkg.section6CorporateRedutorByPayer.totalSupportedReduction).toBe('5000.00');
  });
});

describe('Phase 4I.6 — status derivation (all five package statuses reachable)', () => {
  it('APPLICABLE + net -> READY_FOR_REVIEW', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(baseReadModel(), { generatedAt: GEN_AT });
    expect(pkg.status).toBe('READY_FOR_REVIEW');
  });

  it('APPLICABLE + null net -> INCOMPLETE and net stays null', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(
      baseReadModel({ netMinimumTax: null, status: 'INCOMPLETE_REDUCTION_DATA' }),
      { generatedAt: GEN_AT },
    );
    expect(pkg.status).toBe('INCOMPLETE');
    expect(pkg.section4Calculation.netMinimumTax).toBeNull();
    expect(pkg.section4Calculation.netIsAuthoritative).toBe(false);
  });

  it('REQUIRES_CONFIRMATION -> INCOMPLETE; applicable=null', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(
      baseReadModel({ applicability: 'REQUIRES_CONFIRMATION', netMinimumTax: null }),
      { generatedAt: GEN_AT },
    );
    expect(pkg.status).toBe('INCOMPLETE');
    expect(pkg.section2Applicability.applicable).toBeNull();
  });

  it('NOT_APPLICABLE -> NOT_APPLICABLE; applicable=false', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(
      baseReadModel({
        applicability: 'NOT_APPLICABLE',
        status: 'NOT_APPLICABLE',
        netMinimumTax: null,
        totalAnnualIncome: '100000.00',
      }),
      { generatedAt: GEN_AT },
    );
    expect(pkg.status).toBe('NOT_APPLICABLE');
    expect(pkg.section2Applicability.applicable).toBe(false);
  });

  it('BLOCKED applicability -> BLOCKED', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(
      baseReadModel({ applicability: 'BLOCKED', status: 'BLOCKED', netMinimumTax: null }),
      { generatedAt: GEN_AT },
    );
    expect(pkg.status).toBe('BLOCKED');
    expect(pkg.section2Applicability.applicable).toBeNull();
  });

  it('blockingReasons present -> BLOCKED', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(
      baseReadModel({ blockingReasons: ['LEDGER_BLOCK'], netMinimumTax: null }),
      { generatedAt: GEN_AT },
    );
    expect(pkg.status).toBe('BLOCKED');
  });

  it('upstreamIncomeStatus BLOCKED -> BLOCKED', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(
      baseReadModel({ upstreamIncomeStatus: 'BLOCKED', netMinimumTax: null }),
      { generatedAt: GEN_AT },
    );
    expect(pkg.status).toBe('BLOCKED');
  });

  it('UNSUPPORTED_YEAR -> UNSUPPORTED, figures null-safe', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(
      baseReadModel({
        applicability: 'UNSUPPORTED_YEAR',
        status: 'UNSUPPORTED_YEAR',
        totalAnnualIncome: null,
        applicabilityThreshold: null,
        minimumTaxBase: null,
        grossMinimumTax: null,
        netMinimumTax: null,
        corporateRedutor: null,
      }),
      { generatedAt: GEN_AT },
    );
    expect(pkg.status).toBe('UNSUPPORTED');
    expect(pkg.section2Applicability.applicable).toBeNull();
    expect(pkg.section4Calculation.netMinimumTax).toBeNull();
  });
});

describe('Phase 4I.6 — applicable null-override & null/zero discipline', () => {
  it('forces applicable=null when totalAnnualIncome is null even if APPLICABLE', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(baseReadModel({ totalAnnualIncome: null }), {
      generatedAt: GEN_AT,
    });
    expect(pkg.section2Applicability.applicable).toBeNull();
  });

  it('forces applicable=null when eligibilityThreshold is null', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(
      baseReadModel({ applicabilityThreshold: null }),
      { generatedAt: GEN_AT },
    );
    expect(pkg.section2Applicability.applicable).toBeNull();
  });

  it('never fabricates "0" for a null monetary field', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(
      baseReadModel({ minimumTaxBase: null, grossMinimumTax: null }),
      { generatedAt: GEN_AT },
    );
    expect(pkg.section4Calculation.minimumTaxBase).toBeNull();
    expect(pkg.section4Calculation.grossMinimumTax).toBeNull();
  });

  it('netMinimumTax is null unless READY_FOR_REVIEW even if read model has a value', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(
      baseReadModel({ applicability: 'REQUIRES_CONFIRMATION', netMinimumTax: '999.00' }),
      { generatedAt: GEN_AT },
    );
    expect(pkg.status).toBe('INCOMPLETE');
    expect(pkg.section4Calculation.netMinimumTax).toBeNull();
  });
});

describe('Phase 4I.6 — Section 3 closed no-sum rule', () => {
  it('exposes no cross-row sum and no income total other than verbatim totalAnnualIncome', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(baseReadModel(), { generatedAt: GEN_AT });
    const rows = pkg.section3IncomeComposition.rows;

    const grossSum = '1200000.00'; // 800000 + 400000 if summed
    const includedSum = '1200000.00';
    const itemCountSum = 5;

    // Scan every string field in Section 3 for the computed sums.
    for (const row of rows) {
      const stringFields = [
        row.category,
        row.classification,
        row.grossAmount,
        row.includedAmount,
        row.excludedAmount,
        row.reason,
        row.legalReference,
      ];
      for (const field of stringFields) {
        // grossSum/includedSum happen to equal totalAnnualIncome; ensure they are not
        // present as a Section-3 numeric field (per-row values are 800000/400000).
        expect(field).not.toBe('1200000.00');
      }
      expect(row.itemCount).not.toBe(itemCountSum);
    }
    expect(grossSum).toBe(includedSum); // documents the arithmetic coincidence

    // Section 3 object shape exposes only `rows` — no aggregate total field.
    expect(Object.keys(pkg.section3IncomeComposition)).toEqual(['rows']);
    // The only income total anywhere is Section 2's verbatim totalAnnualIncome.
    expect(pkg.section2Applicability.totalAnnualIncome).toBe('1200000.00');
  });
});

describe('Phase 4I.6 — Section 6 two-branch present/absent', () => {
  it('absent branch: present=false, totals null (never "0"), empty arrays', () => {
    const pkg = buildHighIncomeAnnualReviewPackage(baseReadModel({ corporateRedutor: null }), {
      generatedAt: GEN_AT,
    });
    const s6 = pkg.section6CorporateRedutorByPayer;
    expect(s6.present).toBe(false);
    expect(s6.aggregateVersion).toBeNull();
    expect(s6.status).toBeNull();
    expect(s6.payerCount).toBe(0);
    expect(s6.computedPayerCount).toBe(0);
    expect(s6.totalEligibleDividends).toBeNull();
    expect(s6.totalReductionExact).toBeNull();
    expect(s6.totalSupportedReduction).toBeNull();
    expect(s6.payers).toEqual([]);
    expect(pkg.section4Calculation.corporateRedutorSupportedTotal).toBeNull();
    expect(pkg.section8Provenance.corporateRedutorSourceFingerprint).toBeNull();
  });

  it('present branch: a null total stays null, never turned into "0"', () => {
    const rm = baseReadModel();
    const pkg = buildHighIncomeAnnualReviewPackage(
      {
        ...rm,
        corporateRedutor: { ...rm.corporateRedutor!, totalSupportedReduction: null },
      },
      { generatedAt: GEN_AT },
    );
    expect(pkg.section6CorporateRedutorByPayer.present).toBe(true);
    expect(pkg.section6CorporateRedutorByPayer.totalSupportedReduction).toBeNull();
  });
});

describe('Phase 4I.6 — Section 7 count partition equality', () => {
  it('total === ready + missing + stale + conflicting + unsupported', () => {
    const rm = baseReadModel({
      evidence: [
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          evidenceType: 'CORPORATE_RATE',
          payerId: 'PAYER-A',
          authority: 'TAXPAYER',
          evidenceSource: 'UPLOAD',
          conflictStatus: 'NONE',
          stale: false,
          revision: 1,
          supersedesId: null,
          sourceFingerprint: 's1',
          fingerprint: 'f1',
        },
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          evidenceType: 'CORPORATE_RATE',
          payerId: 'PAYER-B',
          authority: 'TAXPAYER',
          evidenceSource: 'UPLOAD',
          conflictStatus: 'CONFLICT',
          stale: false,
          revision: 1,
          supersedesId: null,
          sourceFingerprint: 's2',
          fingerprint: 'f2',
        },
        {
          id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          evidenceType: 'INCOME',
          payerId: null,
          authority: 'TAXPAYER',
          evidenceSource: 'UPLOAD',
          conflictStatus: 'NONE',
          stale: true,
          revision: 2,
          supersedesId: null,
          sourceFingerprint: 's3',
          fingerprint: 'f3',
        },
      ],
      evidenceRequirements: [
        {
          requirementId: 'REQ-1',
          requirement: 'A',
          subjectId: 'x',
          title: 't',
          status: 'SATISFIED',
          legalReference: 'L',
          blockingReason: null,
        },
        {
          requirementId: 'REQ-2',
          requirement: 'B',
          subjectId: 'y',
          title: 't',
          status: 'MISSING',
          legalReference: 'L',
          blockingReason: 'missing',
        },
      ],
    });
    const pkg = buildHighIncomeAnnualReviewPackage(rm, { generatedAt: GEN_AT });
    const c = pkg.section7Readiness.counts;
    expect(c.total).toBe(c.ready + c.missing + c.stale + c.conflicting + c.unsupported);
    expect(c.conflicting).toBe(1);
    expect(c.stale).toBe(1);
    expect(c.ready).toBe(1);
    expect(c.missing).toBe(1);
  });
});

describe('Phase 4I.6 — registry: zero unproven official mappings', () => {
  it('no VERIFIED_OFFICIAL_MAPPING note lacks a legalReference', () => {
    const notes = HighIncomeReviewFilingRegistry.getNotes();
    const verified = notes.filter((n) => n.mappingStatus === 'VERIFIED_OFFICIAL_MAPPING');
    expect(verified.length).toBe(0);
    for (const note of verified) {
      expect(note.legalReference.trim().length).toBeGreaterThan(0);
    }
  });

  it('exerciseLabel enforces the exercício-2027 caveat', () => {
    expect(exerciseLabel()).toBe('Exercício 2027 (ano-calendário 2026)');
    const pkg = buildHighIncomeAnnualReviewPackage(baseReadModel(), { generatedAt: GEN_AT });
    expect(pkg.section9FilingSupportNotes.exerciseLabel).toBe(
      'Exercício 2027 (ano-calendário 2026)',
    );
  });
});

describe('Phase 4I.6 — CSV export', () => {
  it('carries banner + full disclaimer, uses semicolon delimiter and CRLF', () => {
    const csv = exportHighIncomeReviewPackageToCsv(
      buildHighIncomeAnnualReviewPackage(baseReadModel(), { generatedAt: GEN_AT }),
    );
    expect(csv).toContain(HIGH_INCOME_REVIEW_BANNER);
    expect(csv).toContain(HIGH_INCOME_REVIEW_DISCLAIMER);
    expect(csv).toContain('\r\n');
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv).toContain(';');
  });

  it('escapes CSV-injection prefixes (= + - @ tab CR) with a leading quote', () => {
    const rm = baseReadModel({
      incomeBreakdown: [
        {
          category: '=cmd',
          classification: '+danger',
          grossAmount: '1.00',
          includedAmount: '1.00',
          excludedAmount: '0.00',
          itemCount: 1,
          payerIds: ['@evil'],
          reason: '-minus',
          legalReference: 'L',
        },
      ],
    });
    const csv = exportHighIncomeReviewPackageToCsv(
      buildHighIncomeAnnualReviewPackage(rm, { generatedAt: GEN_AT }),
    );
    expect(csv).toContain("'=cmd");
    expect(csv).toContain("'+danger");
    expect(csv).toContain("'-minus");
    // '@evil' is joined into a payer list cell; still neutralized
    expect(csv).toMatch(/'@evil/);
  });
});

describe('Phase 4I.6 — JSON serialization', () => {
  it('round-trips decimal strings with no precision loss', () => {
    const rm = baseReadModel({ grossMinimumTax: '120000.123456789012345678' });
    const pkg = buildHighIncomeAnnualReviewPackage(rm, { generatedAt: GEN_AT });
    const json = serializeHighIncomeReviewPackageToJson(pkg);
    const parsed = JSON.parse(json);
    expect(parsed.section4Calculation.grossMinimumTax).toBe('120000.123456789012345678');
    expect(typeof parsed.section4Calculation.grossMinimumTax).toBe('string');
  });
});

describe('Phase 4I.6 — DB UUID leak scan', () => {
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  it('neither JSON nor CSV contains evidence id/supersedesId UUIDs', () => {
    const rm = baseReadModel({
      evidence: [
        {
          id: 'deadbeef-dead-beef-dead-beefdeadbeef',
          evidenceType: 'CORPORATE_RATE',
          payerId: 'PAYER-A',
          authority: 'TAXPAYER',
          evidenceSource: 'UPLOAD',
          conflictStatus: 'NONE',
          stale: false,
          revision: 1,
          supersedesId: 'feedface-feed-face-feed-facefeedface',
          sourceFingerprint: 's',
          fingerprint: 'f',
        },
      ],
    });
    const pkg = buildHighIncomeAnnualReviewPackage(rm, { generatedAt: GEN_AT });
    const json = serializeHighIncomeReviewPackageToJson(pkg);
    const csv = exportHighIncomeReviewPackageToCsv(pkg);
    expect(json).not.toMatch(UUID_RE);
    expect(csv).not.toMatch(UUID_RE);
    // rowKey must be present and composite, not a UUID
    expect(pkg.section7Readiness.evidence[0].rowKey).toBe('CORPORATE_RATE:PAYER-A:1');
    expect('id' in pkg.section7Readiness.evidence[0]).toBe(false);
  });
});
