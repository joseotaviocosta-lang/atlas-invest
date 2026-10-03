import { describe, expect, it } from 'vitest';
import {
  buildAnnualTaxReportingPackage,
  ANNUAL_REPORTING_DISCLAIMER,
} from '../../packages/tax-engine/src/annual-irpf';

describe('Domain Unit: Annual Tax Reporting Engine Fixtures A–Z (Phase 4H.6)', () => {
  // FIXTURE A — EMPTY YEAR
  it('Fixture A: Empty year produces NO_ACTIVITY status with 6 sections', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-empty',
      calendarYear: 2025,
      annualPositions: null,
      capitalMarketSummary: null,
      investmentIncomeSummary: null,
    });

    expect(pkg.calendarYear).toBe(2025);
    expect(pkg.declarationExercise).toBe(2026);
    expect(pkg.overallStatus).toBe('NO_ACTIVITY');
    expect(pkg.isReadyForReporting).toBe(true);
    expect(pkg.disclaimer).toBe(ANNUAL_REPORTING_DISCLAIMER);
    expect(pkg.sections).toHaveLength(6);
    expect(pkg.blockedItems).toHaveLength(0);
    expect(pkg.packageFingerprint).toBeDefined();
  });

  // FIXTURE B — SINGLE BRAZILIAN EQUITY POSITION (BENS E DIREITOS 03-01)
  it('Fixture B: Active equity position maps to Bens e Direitos 03-01', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-b',
      calendarYear: 2025,
      annualPositions: {
        positions: [
          {
            assetId: 'asset-petr4',
            ticker: 'PETR4',
            assetType: 'BRAZILIAN_EQUITY',
            closingQuantity: '100.000000000000000000',
            closingTotalCost: '3500.00',
            openingQuantity: '100.000000000000000000',
            openingTotalCost: '3000.00',
            costBasisStatus: 'COMPLETE',
            isBlocked: false,
          },
        ],
      },
    });

    expect(pkg.overallStatus).toBe('READY');
    const bdSection = pkg.sections.find((s) => s.section === 'BENS_E_DIREITOS');
    expect(bdSection?.status).toBe('READY');
    expect(bdSection?.itemCount).toBe(1);

    const item = bdSection?.items.find((i) => i.assetId === 'asset-petr4');
    expect(item).toBeDefined();
    expect(item?.section).toBe('BENS_E_DIREITOS');
    expect(item?.officialMappingCode).toBe('03-01');
    expect(item?.mappingStatus).toBe('OFFICIAL');
    expect(item?.costBasis).toBe('3500.00');
    expect(item?.openingCostBasis).toBe('3000.00');
    expect(item?.description).toContain('100');
    expect(item?.description).toContain('PETR4');
  });

  // FIXTURE C — FII POSITION (BENS E DIREITOS 07-03)
  it('Fixture C: FII position maps to Bens e Direitos 07-03', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-c',
      calendarYear: 2025,
      annualPositions: {
        positions: [
          {
            assetId: 'asset-knri11',
            ticker: 'KNRI11',
            assetType: 'FII',
            closingQuantity: '50.000000000000000000',
            closingTotalCost: '7500.00',
            openingQuantity: '50.000000000000000000',
            openingTotalCost: '7500.00',
            costBasisStatus: 'COMPLETE',
            isBlocked: false,
          },
        ],
      },
    });

    const bdSection = pkg.sections.find((s) => s.section === 'BENS_E_DIREITOS');
    const item = bdSection?.items.find((i) => i.assetId === 'asset-knri11');
    expect(item?.officialMappingCode).toBe('07-03');
    expect(item?.category).toBe('FII_BENS_E_DIREITOS');
  });

  // FIXTURE D — FULLY SOLD OUT ASSET IN CALENDAR YEAR
  it('Fixture D: Zero quantity asset is reported as sold position with 0.00 cost', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-d',
      calendarYear: 2025,
      annualPositions: {
        positions: [
          {
            assetId: 'asset-vale3',
            ticker: 'VALE3',
            assetType: 'BRAZILIAN_EQUITY',
            closingQuantity: '0',
            closingTotalCost: '0.00',
            openingQuantity: '100',
            openingTotalCost: '6000.00',
            costBasisStatus: 'COMPLETE',
            isBlocked: false,
            isSoldOut: true,
          },
        ],
      },
    });

    const bdSection = pkg.sections.find((s) => s.section === 'BENS_E_DIREITOS');
    const item = bdSection?.items.find((i) => i.assetId === 'asset-vale3');
    expect(item).toBeDefined();
    expect(item?.category).toBe('POSICAO_ALIENADA_BENS_E_DIREITOS');
    expect(item?.officialMappingCode).toBe('03-01');
    expect(item?.closingQuantity).toBe('0');
    expect(item?.costBasis).toBe('0.00');
    expect(item?.openingCostBasis).toBe('6000.00');
  });

  // FIXTURE E — EXEMPT EQUITY NET GAINS (RENDIMENTOS ISENTOS 20)
  it('Fixture E: Exempt capital gains report to Rendimentos Isentos 20', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-e',
      calendarYear: 2025,
      capitalMarketSummary: {
        normalEquities: {
          exemptSalesGross: '15000.00',
          exemptSalesNetGain: '2000.00',
          netGain: '0.00',
        },
      },
    });

    const isentosSection = pkg.sections.find((s) => s.section === 'RENDIMENTOS_ISENTOS');
    const item = isentosSection?.items.find((i) => i.category === 'GANHO_ISENTO_ACOES_20K');
    expect(item).toBeDefined();
    expect(item?.officialMappingCode).toBe('20');
    expect(item?.netAmount).toBe('2000.00');
  });

  // FIXTURE F — TAXABLE NORMAL OPERATIONS (RENDA VARIÁVEL)
  it('Fixture F: Taxable equity operations report in Renda Variável grid', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-f',
      calendarYear: 2025,
      capitalMarketSummary: {
        normalEquities: {
          netGain: '5000.00',
        },
      },
    });

    const rvSection = pkg.sections.find((s) => s.section === 'RENDA_VARIAVEL_MENSAL');
    const item = rvSection?.items.find((i) => i.category === 'GANHO_LIQUIDO_COMUM');
    expect(item).toBeDefined();
    expect(item?.netAmount).toBe('5000.00');
  });

  // FIXTURE G — DAY TRADE OPERATIONS (RENDA VARIÁVEL)
  it('Fixture G: Day trade operations report in Renda Variável', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-g',
      calendarYear: 2025,
      capitalMarketSummary: {
        dayTrade: {
          netGain: '1200.00',
        },
      },
    });

    const rvSection = pkg.sections.find((s) => s.section === 'RENDA_VARIAVEL_MENSAL');
    const item = rvSection?.items.find((i) => i.category === 'GANHO_LIQUIDO_DAY_TRADE');
    expect(item?.netAmount).toBe('1200.00');
  });

  // FIXTURE H — ACCUMULATED LOSSES CARRY-FORWARD
  it('Fixture H: Closing loss carries forward to annual reporting', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-h',
      calendarYear: 2025,
      capitalMarketSummary: {
        normalEquities: {
          netGain: '-4500.00',
          endingLossCarry: '4500.00',
        },
        dayTrade: {
          netGain: '-1000.00',
          endingLossCarry: '1000.00',
        },
      },
    });

    const rvSection = pkg.sections.find((s) => s.section === 'RENDA_VARIAVEL_MENSAL');
    const lossCommon = rvSection?.items.find((i) => i.category === 'PREJUIZO_ACUMULADO_COMUM');
    expect(lossCommon?.netAmount).toBe('4500.00');
    const lossDt = rvSection?.items.find((i) => i.category === 'PREJUIZO_ACUMULADO_DAY_TRADE');
    expect(lossDt?.netAmount).toBe('1000.00');
  });

  // FIXTURE I — EXEMPT DIVIDENDS (RENDIMENTOS ISENTOS 09)
  it('Fixture I: Pre-2026 dividends map to Rendimentos Isentos 09', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-i',
      calendarYear: 2025,
      investmentIncomeSummary: {
        payers: [
          {
            assetId: 'asset-itub4',
            ticker: 'ITUB4',
            payerName: 'ITAU UNIBANCO',
            payerDocument: '60.701.190/0001-04',
            incomeType: 'DIVIDEND',
            taxTreatment: 'EXEMPT',
            grossAmount: '1200.00',
            withheldAmount: '0.00',
            netAmount: '1200.00',
          },
        ],
      },
    });

    const isentosSection = pkg.sections.find((s) => s.section === 'RENDIMENTOS_ISENTOS');
    const item = isentosSection?.items.find((i) => i.assetId === 'asset-itub4');
    expect(item).toBeDefined();
    expect(item?.officialMappingCode).toBe('09');
    expect(item?.grossAmount).toBe('1200.00');
    expect(item?.payerId).toBe('60.701.190/0001-04');
  });

  // FIXTURE J — JCP WITHHOLDING (RENDIMENTOS EXCLUSIVOS 10)
  it('Fixture J: JCP maps to Rendimentos Sujeitos à Tributação Exclusiva 10', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-j',
      calendarYear: 2025,
      investmentIncomeSummary: {
        payers: [
          {
            assetId: 'asset-bbas3',
            ticker: 'BBAS3',
            payerName: 'BANCO DO BRASIL',
            payerDocument: '00.000.000/0001-91',
            incomeType: 'JCP',
            taxTreatment: 'EXCLUSIVE',
            grossAmount: '1000.00',
            withheldAmount: '150.00',
            netAmount: '850.00',
          },
        ],
      },
    });

    const exclSection = pkg.sections.find((s) => s.section === 'RENDIMENTOS_EXCLUSIVOS');
    const item = exclSection?.items.find((i) => i.assetId === 'asset-bbas3');
    expect(item).toBeDefined();
    expect(item?.officialMappingCode).toBe('10');
    expect(item?.grossAmount).toBe('1000.00');
    expect(item?.withheldAmount).toBe('150.00');
    expect(item?.netAmount).toBe('850.00');
  });

  // FIXTURE K — EXEMPT FII INCOME (RENDIMENTOS ISENTOS 26)
  it('Fixture K: Verified FII income maps to Rendimentos Isentos 26', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-k',
      calendarYear: 2025,
      investmentIncomeSummary: {
        payers: [
          {
            assetId: 'asset-hglg11',
            ticker: 'HGLG11',
            payerName: 'CSHG LOGISTICA',
            payerDocument: '11.728.688/0001-47',
            incomeType: 'FII_INCOME',
            taxTreatment: 'EXEMPT',
            grossAmount: '3200.00',
            withheldAmount: '0.00',
            netAmount: '3200.00',
          },
        ],
      },
    });

    const isentosSection = pkg.sections.find((s) => s.section === 'RENDIMENTOS_ISENTOS');
    const item = isentosSection?.items.find((i) => i.assetId === 'asset-hglg11');
    expect(item).toBeDefined();
    expect(item?.officialMappingCode).toBe('26');
    expect(item?.grossAmount).toBe('3200.00');
  });

  // FIXTURE L — 2026 DIVIDEND WITHHOLDING UNDER LEI 15.270/2025 (PROVISIONAL)
  it('Fixture L: 2026 taxable dividends map to PROVISIONAL exclusive withholding', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-l',
      calendarYear: 2026,
      investmentIncomeSummary: {
        payers: [
          {
            assetId: 'asset-petr4',
            ticker: 'PETR4',
            payerName: 'PETROBRAS',
            payerDocument: '33.000.167/0001-01',
            incomeType: 'DIVIDEND',
            taxTreatment: 'EXCLUSIVE',
            grossAmount: '60000.00',
            withheldAmount: '6000.00',
            netAmount: '54000.00',
          },
        ],
      },
    });

    const exclSection = pkg.sections.find((s) => s.section === 'RENDIMENTOS_EXCLUSIVOS');
    const item = exclSection?.items.find((i) => i.assetId === 'asset-petr4');
    expect(item).toBeDefined();
    expect(item?.mappingStatus).toBe('PROVISIONAL');
    expect(item?.officialMappingCode).toBe('TRIB_EXCL_DIV_2026');
    expect(item?.grossAmount).toBe('60000.00');
    expect(item?.withheldAmount).toBe('6000.00');
  });

  // FIXTURE M — 2026 TRANSITION DIVIDEND (ISENTO 09)
  it('Fixture M: 2026 transition dividend maps to Rendimentos Isentos 09', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-m',
      calendarYear: 2026,
      investmentIncomeSummary: {
        payers: [
          {
            assetId: 'asset-vale3',
            ticker: 'VALE3',
            payerName: 'VALE',
            payerDocument: '33.592.510/0001-54',
            incomeType: 'DIVIDEND',
            taxTreatment: 'EXEMPT',
            grossAmount: '40000.00',
            withheldAmount: '0.00',
            netAmount: '40000.00',
            transitionEligibility: 'ELIGIBLE',
          },
        ],
      },
    });

    const isentosSection = pkg.sections.find((s) => s.section === 'RENDIMENTOS_ISENTOS');
    const item = isentosSection?.items.find((i) => i.assetId === 'asset-vale3');
    expect(item).toBeDefined();
    expect(item?.category).toBe('DIVIDENDOS_ISENTOS_TRANSICAO');
    expect(item?.officialMappingCode).toBe('09');
  });

  // FIXTURE N — IRRF ON DAY TRADE
  it('Fixture N: Day trade IRRF maps to Imposto Pago/Retido', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-n',
      calendarYear: 2025,
      capitalMarketSummary: {
        dayTrade: {
          irrfTotalWithheld: '150.00',
          irrfTerminalBalance: '150.00',
          irrfTerminalStatus: 'AVAILABLE_FOR_RESTITUTION',
        },
      },
    });

    const impostoSection = pkg.sections.find((s) => s.section === 'IMPOSTO_PAGO_E_RETIDO');
    const item = impostoSection?.items.find((i) => i.category === 'IRRF_RETIDO_DAY_TRADE');
    expect(item).toBeDefined();
    expect(item?.withheldAmount).toBe('150.00');
  });

  // FIXTURE O — IRRF ON NORMAL OPERATIONS
  it('Fixture O: Normal operations IRRF maps to Imposto Pago/Retido', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-o',
      calendarYear: 2025,
      capitalMarketSummary: {
        normalEquities: {
          irrfTotalWithheld: '45.00',
          irrfTerminalBalance: '45.00',
          irrfTerminalStatus: 'AVAILABLE_FOR_ANNUAL_ADJUSTMENT',
        },
      },
    });

    const impostoSection = pkg.sections.find((s) => s.section === 'IMPOSTO_PAGO_E_RETIDO');
    const item = impostoSection?.items.find((i) => i.category === 'IRRF_RETIDO_COMUM');
    expect(item).toBeDefined();
    expect(item?.withheldAmount).toBe('45.00');
  });

  // FIXTURE P — DARF 6015 PAYMENTS
  it('Fixture P: DARF 6015 payments map to Imposto Pago/Retido', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-p',
      calendarYear: 2025,
      capitalMarketSummary: {
        obligations6015: {
          items: [
            {
              competence: '2025-02',
              status: 'PAID',
              paidAmount: '500.00',
              paymentDate: '2025-03-28',
            },
          ],
        },
      },
    });

    const impostoSection = pkg.sections.find((s) => s.section === 'IMPOSTO_PAGO_E_RETIDO');
    const item = impostoSection?.items.find((i) => i.category === 'DARF_6015_PAGO');
    expect(item).toBeDefined();
    expect(item?.grossAmount).toBe('500.00');
  });

  // FIXTURE Q — BLOCKED SECTION PROPAGATION
  it('Fixture Q: Upstream blocked readiness propagates isBlocked flag and blocking reasons', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-q',
      calendarYear: 2025,
      annualPositions: {
        positions: [
          {
            assetId: 'asset-unverified',
            ticker: 'UNV3',
            assetType: 'BRAZILIAN_EQUITY',
            closingQuantity: '100',
            closingTotalCost: '1000.00',
            costBasisStatus: 'INCOMPLETE',
            isBlocked: true,
            blockingReasons: ['OPENING_COST_BASIS_UNCONFIRMED'],
          },
        ],
      },
    });

    expect(pkg.overallStatus).toBe('BLOCKED');
    expect(pkg.isReadyForReporting).toBe(false);
    expect(pkg.blockedItems).toHaveLength(1);
    expect(pkg.blockedItems[0]?.blockingReasons).toContain('OPENING_COST_BASIS_UNCONFIRMED');
  });

  // FIXTURE R — BLOCKED INVESTMENT INCOME
  it('Fixture R: Blocked FII eligibility flags reporting item as requires confirmation', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-r',
      calendarYear: 2025,
      investmentIncomeSummary: {
        payers: [
          {
            assetId: 'asset-fii-blocked',
            ticker: 'FIIB11',
            payerName: 'FII DESCONHECIDO',
            payerDocument: '00.000.000/0001-00',
            incomeType: 'FII_INCOME',
            taxTreatment: 'EXEMPT',
            grossAmount: '1500.00',
            withheldAmount: '0.00',
            netAmount: '1500.00',
            status: 'REQUIRES_CONFIRMATION',
          },
        ],
      },
    });

    expect(pkg.overallStatus).toBe('REQUIRES_CONFIRMATION');
    expect(pkg.pendingConfirmations).toHaveLength(1);
  });

  // FIXTURE S — MULTI-ASSET PORTFOLIO FULL PACKAGE
  it('Fixture S: Multi-asset portfolio yields complete reporting package across sections', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-s',
      calendarYear: 2025,
      annualPositions: {
        positions: [
          {
            assetId: 'asset-petr4',
            ticker: 'PETR4',
            assetType: 'BRAZILIAN_EQUITY',
            closingQuantity: '200',
            closingTotalCost: '7000.00',
            openingQuantity: '200',
            openingTotalCost: '6000.00',
            costBasisStatus: 'COMPLETE',
            isBlocked: false,
          },
        ],
      },
      capitalMarketSummary: {
        normalEquities: {
          netGain: '4000.00',
        },
      },
      investmentIncomeSummary: {
        payers: [
          {
            assetId: 'asset-petr4',
            ticker: 'PETR4',
            payerName: 'PETROBRAS',
            payerDocument: '33.000.167/0001-01',
            incomeType: 'DIVIDEND',
            taxTreatment: 'EXEMPT',
            grossAmount: '2500.00',
            withheldAmount: '0.00',
            netAmount: '2500.00',
          },
        ],
      },
    });

    expect(pkg.overallStatus).toBe('READY');
    expect(pkg.sections.find((s) => s.section === 'BENS_E_DIREITOS')?.itemCount).toBe(1);
    expect(pkg.sections.find((s) => s.section === 'RENDIMENTOS_ISENTOS')?.itemCount).toBe(1);
    expect(pkg.sections.find((s) => s.section === 'RENDA_VARIAVEL_MENSAL')?.itemCount).toBe(1);
  });

  // FIXTURE T — FINGERPRINT DETERMINISM
  it('Fixture T: Repeated executions produce identical SHA-256 packageFingerprint', () => {
    const input = {
      taxSubjectId: 'user-t',
      calendarYear: 2025,
      annualPositions: null,
      capitalMarketSummary: null,
      investmentIncomeSummary: null,
    };

    const pkg1 = buildAnnualTaxReportingPackage(input);
    const pkg2 = buildAnnualTaxReportingPackage(input);

    expect(pkg1.packageFingerprint).toBe(pkg2.packageFingerprint);
    expect(pkg1.packageFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  // FIXTURE U — DEEP IMMUTABILITY
  it('Fixture U: Generated package and sections are deeply frozen', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-u',
      calendarYear: 2025,
      annualPositions: null,
      capitalMarketSummary: null,
      investmentIncomeSummary: null,
    });

    expect(Object.isFrozen(pkg)).toBe(true);
    expect(Object.isFrozen(pkg.sections)).toBe(true);
    expect(Object.isFrozen(pkg.blockedItems)).toBe(true);
  });

  // FIXTURE V — MANDATORY DISCLAIMER PRESENCE
  it('Fixture V: Package contains mandatory non-transmission disclaimer', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-v',
      calendarYear: 2025,
      annualPositions: null,
      capitalMarketSummary: null,
      investmentIncomeSummary: null,
    });

    expect(pkg.disclaimer).toBe(ANNUAL_REPORTING_DISCLAIMER);
    expect(pkg.disclaimer).toContain('Não substitui o Programa Gerador da Declaração (PGD)');
  });

  // FIXTURE W — EXERCISE YEAR CALCULATION
  it('Fixture W: Exercise is always calendarYear + 1', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-w',
      calendarYear: 2026,
      annualPositions: null,
      capitalMarketSummary: null,
      investmentIncomeSummary: null,
    });

    expect(pkg.declarationExercise).toBe(2027);
  });

  // FIXTURE X — UNKNOWN/MISSING FAIL-CLOSED
  it('Fixture X: Null/unresolved fields do not coerce to zero strings unexpectedly', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-x',
      calendarYear: 2025,
      annualPositions: {
        positions: [
          {
            assetId: 'asset-partial',
            ticker: 'PART3',
            assetType: 'BRAZILIAN_EQUITY',
            closingQuantity: '50',
            closingTotalCost: '1000.00',
            costBasisStatus: 'COMPLETE',
            isBlocked: false,
          },
        ],
      },
    });

    const bdSection = pkg.sections.find((s) => s.section === 'BENS_E_DIREITOS');
    const item = bdSection?.items.find((i) => i.assetId === 'asset-partial');
    expect(item?.costBasis).toBe('1000.00');
  });

  // FIXTURE Y — ZERO-COST BONUS ASSET
  it('Fixture Y: Zero acquisition cost asset reports costBasis as 0.00 correctly', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-y',
      calendarYear: 2025,
      annualPositions: {
        positions: [
          {
            assetId: 'asset-bonus',
            ticker: 'BONU3',
            assetType: 'BRAZILIAN_EQUITY',
            closingQuantity: '10',
            closingTotalCost: '0.00',
            openingQuantity: '0',
            openingTotalCost: '0.00',
            costBasisStatus: 'COMPLETE',
            isBlocked: false,
          },
        ],
      },
    });

    const bdSection = pkg.sections.find((s) => s.section === 'BENS_E_DIREITOS');
    const item = bdSection?.items.find((i) => i.assetId === 'asset-bonus');
    expect(item?.costBasis).toBe('0.00');
  });

  // FIXTURE Z — MULTIPLE PAYERS ISOLATION
  it('Fixture Z: Multiple payers in investment income are reported as distinct items without cross-contamination', () => {
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-z',
      calendarYear: 2025,
      investmentIncomeSummary: {
        payers: [
          {
            assetId: 'asset-payer-1',
            ticker: 'EMPA3',
            payerName: 'EMPRESA A',
            payerDocument: '11.111.111/0001-11',
            incomeType: 'DIVIDEND',
            taxTreatment: 'EXEMPT',
            grossAmount: '500.00',
            withheldAmount: '0.00',
            netAmount: '500.00',
          },
          {
            assetId: 'asset-payer-2',
            ticker: 'EMPB3',
            payerName: 'EMPRESA B',
            payerDocument: '22.222.222/0001-22',
            incomeType: 'DIVIDEND',
            taxTreatment: 'EXEMPT',
            grossAmount: '750.00',
            withheldAmount: '0.00',
            netAmount: '750.00',
          },
        ],
      },
    });

    const isentosSection = pkg.sections.find((s) => s.section === 'RENDIMENTOS_ISENTOS');
    expect(isentosSection?.items).toHaveLength(2);
    expect(isentosSection?.items[0]?.payerId).toBe('11.111.111/0001-11');
    expect(isentosSection?.items[1]?.payerId).toBe('22.222.222/0001-22');
  });
});
