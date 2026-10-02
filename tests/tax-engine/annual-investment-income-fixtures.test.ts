import { describe, expect, it } from 'vitest';
import {
  buildAnnualInvestmentIncomeSummary,
  classifyIncomeEvent,
  IncomeEventInputData,
} from '../../packages/tax-engine/src';
import { Money } from '../../packages/domain/src';

describe('Tax Engine: Annual Investment Income Fixtures A–AH (Phase 4H.4 / 4H.4A.1)', () => {
  // Fixture A — 2025 DIVIDEND (Fully Exempt under Lei 9.249/95)
  it('Fixture A — 2025 DIVIDEND: Domestic dividend in 2025 is 100% exempt with 0% withholding', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-div-2025-1',
      incomeType: 'DIVIDEND',
      assetId: 'asset-petr4',
      payerId: 'asset-petr4',
      payerDisplayName: 'PETROBRAS PN',
      paymentDate: '2025-05-20',
      grossAmount: '12000',
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.taxTreatment).toBe('EXEMPT');
    expect(classified.ruleId).toBe('R-DIV-2025');
    expect(classified.withheldTaxAmount?.amount).toBe('0');
    expect(classified.netAmount.amount).toBe('12000');

    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      events: [event],
    });

    expect(summary.dividends.totalGrossAmount.amount).toBe('12000');
    expect(summary.dividends.totalWithheldTax.amount).toBe('0');
    expect(summary.dividends.totalNetAmount.amount).toBe('12000');
    expect(summary.isComplete).toBe(true);
  });

  // Fixture B — 2026 DIVIDEND BELOW THRESHOLD (R$ 30,000 <= R$ 50,000)
  it('Fixture B — 2026 DIVIDEND BELOW THRESHOLD: Monthly dividend of R$ 30,000 <= R$ 50,000 is EXEMPT', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-div-2026-below',
      incomeType: 'DIVIDEND',
      assetId: 'asset-vale3',
      payerId: 'asset-vale3',
      payerDisplayName: 'VALE ON',
      paymentDate: '2026-03-15',
      grossAmount: '30000',
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.taxTreatment).toBe('EXEMPT');
    expect(classified.ruleId).toBe('R-DIV-2026');
    expect(classified.withheldTaxAmount?.amount).toBe('0');
    expect(classified.netAmount.amount).toBe('30000');

    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2026,
      taxSubjectId: 'user-1',
      events: [event],
    });

    expect(summary.dividends.totalGrossAmount.amount).toBe('30000');
    expect(summary.dividends.totalWithheldTax.amount).toBe('0');
    expect(summary.dividends.totalNetAmount.amount).toBe('30000');
  });

  // Fixture C — 2026 DIVIDEND EXACT THRESHOLD (R$ 50,000 — "superior a" means <= 50k is exempt)
  it('Fixture C — 2026 DIVIDEND EXACT THRESHOLD: Monthly dividend of exactly R$ 50,000.00 is EXEMPT', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-div-2026-exact',
      incomeType: 'DIVIDEND',
      assetId: 'asset-vale3',
      payerId: 'asset-vale3',
      payerDisplayName: 'VALE ON',
      paymentDate: '2026-04-10',
      grossAmount: '50000',
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.taxTreatment).toBe('EXEMPT');
    expect(classified.withheldTaxAmount?.amount).toBe('0');
    expect(classified.netAmount.amount).toBe('50000');

    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2026,
      taxSubjectId: 'user-1',
      events: [event],
    });

    expect(summary.dividends.totalGrossAmount.amount).toBe('50000');
    expect(summary.dividends.totalWithheldTax.amount).toBe('0');
  });

  // Fixture D — 2026 DIVIDEND ABOVE THRESHOLD (TOTAL-BASE per Lei 15.270/2025)
  // R$ 70,000 > R$ 50,000 → 10% on TOTAL = R$ 7,000 (NOT R$ 2,000 excess-only)
  it('Fixture D — 2026 DIVIDEND ABOVE THRESHOLD: R$ 70,000 → 10% on TOTAL = R$ 7,000', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-div-2026-above',
      incomeType: 'DIVIDEND',
      assetId: 'asset-vale3',
      payerId: 'asset-vale3',
      payerDisplayName: 'VALE ON',
      paymentDate: '2026-05-10',
      grossAmount: '70000',
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.taxTreatment).toBe('WITHHOLDING_EXCLUSIVE');
    expect(classified.ruleId).toBe('R-DIV-2026');
    expect(classified.withheldTaxAmount?.amount).toBe('7000');
    expect(classified.netAmount.amount).toBe('63000');

    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2026,
      taxSubjectId: 'user-1',
      events: [event],
    });

    expect(summary.dividends.totalGrossAmount.amount).toBe('70000');
    expect(summary.dividends.totalWithheldTax.amount).toBe('7000');
    expect(summary.dividends.totalNetAmount.amount).toBe('63000');
  });

  // Fixture E — SAME PAYER / SAME MONTH AGGREGATION (TOTAL-BASE)
  // 30k + 30k = 60k > 50k → 10% on 60k = 6,000 (NOT 1,000 excess-only)
  it('Fixture E — SAME PAYER / SAME MONTH: Two R$ 30k from same payer (total R$ 60k) → R$ 6,000 withholding', () => {
    const event1: IncomeEventInputData = {
      incomeEventId: 'evt-div-e1',
      incomeType: 'DIVIDEND',
      assetId: 'asset-itub4',
      payerId: 'asset-itub4',
      payerDisplayName: 'ITAU UNIBANCO PN',
      paymentDate: '2026-06-05',
      grossAmount: '30000',
    };
    const event2: IncomeEventInputData = {
      incomeEventId: 'evt-div-e2',
      incomeType: 'DIVIDEND',
      assetId: 'asset-itub4',
      payerId: 'asset-itub4',
      payerDisplayName: 'ITAU UNIBANCO PN',
      paymentDate: '2026-06-25',
      grossAmount: '30000',
    };

    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2026,
      taxSubjectId: 'user-1',
      events: [event1, event2],
    });

    expect(summary.dividends.totalGrossAmount.amount).toBe('60000');
    expect(summary.dividends.totalWithheldTax.amount).toBe('6000');
    expect(summary.dividends.totalNetAmount.amount).toBe('54000');
  });

  // Fixture F — MULTIPLE PAYERS (Payer Isolation)
  it('Fixture F — MULTIPLE PAYERS: Payer 1 pays R$ 40k and Payer 2 pays R$ 40k in same month -> both <= 50k, 0% withholding', () => {
    const event1: IncomeEventInputData = {
      incomeEventId: 'evt-f1',
      incomeType: 'DIVIDEND',
      assetId: 'asset-petr4',
      payerId: 'asset-petr4',
      payerDisplayName: 'PETROBRAS PN',
      paymentDate: '2026-07-10',
      grossAmount: '40000',
    };
    const event2: IncomeEventInputData = {
      incomeEventId: 'evt-f2',
      incomeType: 'DIVIDEND',
      assetId: 'asset-vale3',
      payerId: 'asset-vale3',
      payerDisplayName: 'VALE ON',
      paymentDate: '2026-07-15',
      grossAmount: '40000',
    };

    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2026,
      taxSubjectId: 'user-1',
      events: [event1, event2],
    });

    expect(summary.dividends.totalGrossAmount.amount).toBe('80000');
    expect(summary.dividends.totalWithheldTax.amount).toBe('0');
    expect(summary.payers).toHaveLength(2);
  });

  // Fixture G — DIVIDEND WITHHOLDING (Explicit evidence)
  it('Fixture G — DIVIDEND WITHHOLDING: Explicit withholding evidence is preserved and segregated', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-g',
      incomeType: 'DIVIDEND',
      assetId: 'asset-bbas3',
      payerId: 'asset-bbas3',
      payerDisplayName: 'BANCO DO BRASIL ON',
      paymentDate: '2026-08-20',
      grossAmount: '100000',
      withheldTaxAmount: '10000',
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.grossAmount.amount).toBe('100000');
    expect(classified.withheldTaxAmount?.amount).toBe('10000');
    expect(classified.netAmount.amount).toBe('90000');
  });

  // Fixture H — MISSING DIVIDEND EVIDENCE / Fail-Closed
  it('Fixture H — MISSING DIVIDEND EVIDENCE: Invalid date fails closed to BLOCKED', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-h',
      incomeType: 'DIVIDEND',
      assetId: 'asset-bad',
      paymentDate: 'invalid-date',
      grossAmount: '1000',
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.taxTreatment).toBe('BLOCKED');
    expect(classified.completenessStatus).toBe('BLOCKED');
  });

  // Fixture I — JCP 2025 (15% Withholding Rate)
  it('Fixture I — JCP 2025: JCP in 2025 applies 15% statutory withholding at source', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-jcp-2025',
      incomeType: 'JCP',
      assetId: 'asset-itub4',
      payerId: 'asset-itub4',
      payerDisplayName: 'ITAU UNIBANCO PN',
      paymentDate: '2025-09-15',
      grossAmount: '10000',
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.ruleId).toBe('R-JCP-2025');
    expect(classified.taxTreatment).toBe('WITHHOLDING_EXCLUSIVE');
    expect(classified.withheldTaxAmount?.amount).toBe('1500');
    expect(classified.netAmount.amount).toBe('8500');
  });

  // Fixture J — JCP 2026 (17.5% Withholding Rate)
  it('Fixture J — JCP 2026: JCP in 2026 applies 17.5% statutory withholding at source', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-jcp-2026',
      incomeType: 'JCP',
      assetId: 'asset-itub4',
      payerId: 'asset-itub4',
      payerDisplayName: 'ITAU UNIBANCO PN',
      paymentDate: '2026-02-15',
      grossAmount: '10000',
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.ruleId).toBe('R-JCP-2026');
    expect(classified.taxTreatment).toBe('WITHHOLDING_EXCLUSIVE');
    expect(classified.withheldTaxAmount?.amount).toBe('1750');
    expect(classified.netAmount.amount).toBe('8250');
  });

  // Fixture K — JCP WITHHOLDING (Exact Decimal Math)
  it('Fixture K — JCP WITHHOLDING: Sub-cent rounding on 17.5% withholding is mathematically exact', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-jcp-k',
      incomeType: 'JCP',
      assetId: 'asset-petr4',
      paymentDate: '2026-03-20',
      grossAmount: '1000.33',
    };

    const classified = classifyIncomeEvent(event);
    // 1000.33 * 0.175 = 175.05775
    expect(classified.withheldTaxAmount?.amount).toBe('175.05775');
    expect(classified.netAmount.amount).toBe('825.27225');
  });

  // Fixture L — FII ELIGIBLE (Lei 11.033/04 Art. 3º III)
  it('Fixture L — FII ELIGIBLE: Verified conditions yields EXEMPT', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-fii-l',
      incomeType: 'FII_INCOME',
      assetId: 'asset-knri11',
      payerId: 'asset-knri11',
      payerDisplayName: 'KINEA RENDA IMOBILIARIA FII',
      paymentDate: '2025-06-15',
      grossAmount: '5000',
      fiiEligibility: {
        isListed: true,
        investorCountAtLeast100: true,
        beneficiaryOwnershipLessThan10Percent: true,
      },
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.taxTreatment).toBe('EXEMPT');
    expect(classified.ruleId).toBe('R-FII-EXEMPT');
    expect(classified.completenessStatus).toBe('COMPLETE');
  });

  // Fixture M — FII UNKNOWN (Missing Facts -> REQUIRES_CONFIRMATION)
  it('Fixture M — FII UNKNOWN: Missing eligibility metadata fails closed to REQUIRES_CONFIRMATION', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-fii-m',
      incomeType: 'FII_INCOME',
      assetId: 'asset-unknown-fii',
      paymentDate: '2025-07-15',
      grossAmount: '2000',
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.taxTreatment).toBe('REQUIRES_CONFIRMATION');
    expect(classified.completenessStatus).toBe('REQUIRES_CONFIRMATION');
    expect(classified.blockingReasons).toContain('FII_ELIGIBILITY_UNVERIFIED');
  });

  // Fixture N — FII INELIGIBLE (Failed Condition -> WITHHOLDING_EXCLUSIVE)
  it('Fixture N — FII INELIGIBLE: Closely held FII is classified as WITHHOLDING_EXCLUSIVE', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-fii-n',
      incomeType: 'FII_INCOME',
      assetId: 'asset-closed-fii',
      paymentDate: '2025-08-15',
      grossAmount: '10000',
      fiiEligibility: {
        isListed: false,
        investorCountAtLeast100: false,
        beneficiaryOwnershipLessThan10Percent: true,
      },
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.taxTreatment).toBe('WITHHOLDING_EXCLUSIVE');
    expect(classified.ruleId).toBe('R-FII-TAXABLE');
  });

  // Fixture O — MIXED INCOME (Dividends + JCP + FII)
  it('Fixture O — MIXED INCOME: Consolidated summary accurately tracks 3 separate income buckets', () => {
    const divEvt: IncomeEventInputData = {
      incomeEventId: 'evt-o-div',
      incomeType: 'DIVIDEND',
      assetId: 'asset-petr4',
      paymentDate: '2025-04-10',
      grossAmount: '10000',
    };
    const jcpEvt: IncomeEventInputData = {
      incomeEventId: 'evt-o-jcp',
      incomeType: 'JCP',
      assetId: 'asset-itub4',
      paymentDate: '2025-04-15',
      grossAmount: '5000',
    };
    const fiiEvt: IncomeEventInputData = {
      incomeEventId: 'evt-o-fii',
      incomeType: 'FII_INCOME',
      assetId: 'asset-hglg11',
      paymentDate: '2025-04-20',
      grossAmount: '2000',
      fiiEligibility: { isVerified: true },
    };

    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      events: [divEvt, jcpEvt, fiiEvt],
    });

    expect(summary.totalGrossIncome.amount).toBe('17000');
    expect(summary.totalWithheldTax.amount).toBe('750'); // 5000 * 0.15
    expect(summary.dividends.totalGrossAmount.amount).toBe('10000');
    expect(summary.jcp.totalGrossAmount.amount).toBe('5000');
    expect(summary.fiiIncome.totalGrossAmount.amount).toBe('2000');
  });

  // Fixture P — SAME PAYER MULTIPLE MONTHS
  it('Fixture P — SAME PAYER MULTIPLE MONTHS: Monthly threshold resets (Jan R$ 40k, Feb R$ 40k) → both exempt', () => {
    const janEvt: IncomeEventInputData = {
      incomeEventId: 'evt-p1',
      incomeType: 'DIVIDEND',
      assetId: 'asset-vale3',
      paymentDate: '2026-01-15',
      grossAmount: '40000',
    };
    const febEvt: IncomeEventInputData = {
      incomeEventId: 'evt-p2',
      incomeType: 'DIVIDEND',
      assetId: 'asset-vale3',
      paymentDate: '2026-02-15',
      grossAmount: '40000',
    };

    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2026,
      taxSubjectId: 'user-1',
      events: [janEvt, febEvt],
    });

    expect(summary.dividends.totalGrossAmount.amount).toBe('80000');
    expect(summary.dividends.totalWithheldTax.amount).toBe('0');
  });

  // Fixture Q — DUPLICATE EVENT DEDUPLICATION
  it('Fixture Q — DUPLICATE EVENT: Identical incomeEventId is deduplicated', () => {
    const evt: IncomeEventInputData = {
      incomeEventId: 'evt-q-dup',
      incomeType: 'DIVIDEND',
      assetId: 'asset-petr4',
      paymentDate: '2025-05-10',
      grossAmount: '5000',
    };

    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      events: [evt, evt],
    });

    expect(summary.dividends.eventCount).toBe(1);
    expect(summary.totalGrossIncome.amount).toBe('5000');
  });

  // Fixture R — EVENT REVISION
  it('Fixture R — EVENT REVISION: Updated income event produces deterministic revision', () => {
    const initialEvt: IncomeEventInputData = {
      incomeEventId: 'evt-r',
      incomeType: 'JCP',
      assetId: 'asset-bbas3',
      paymentDate: '2025-06-10',
      grossAmount: '4000',
    };
    const revisedEvt: IncomeEventInputData = {
      incomeEventId: 'evt-r',
      incomeType: 'JCP',
      assetId: 'asset-bbas3',
      paymentDate: '2025-06-10',
      grossAmount: '4500',
    };

    const summary1 = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      events: [initialEvt],
    });
    const summary2 = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      events: [revisedEvt],
    });

    expect(summary1.jcp.totalGrossAmount.amount).toBe('4000');
    expect(summary2.jcp.totalGrossAmount.amount).toBe('4500');
    expect(summary1.fingerprint).not.toBe(summary2.fingerprint);
  });

  // Fixture S — BLOCKED EVENT
  it('Fixture S — BLOCKED EVENT: Unsupported foreign currency blocks the summary', () => {
    const usdEvt: IncomeEventInputData = {
      incomeEventId: 'evt-s-usd',
      incomeType: 'DIVIDEND',
      assetId: 'asset-aapl',
      paymentDate: '2025-07-10',
      grossAmount: '100',
      currency: 'USD',
    };

    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      events: [usdEvt],
    });

    expect(summary.status).toBe('BLOCKED');
    expect(summary.blockingReasons).toContain('UNSUPPORTED_FOREIGN_CURRENCY_USD');
  });

  // Fixture T — YEAR BOUNDARY
  it('Fixture T — YEAR BOUNDARY: Strict calendar-year partitioning between 2025-12-31 and 2026-01-01', () => {
    const evt2025: IncomeEventInputData = {
      incomeEventId: 'evt-t-2025',
      incomeType: 'DIVIDEND',
      assetId: 'asset-petr4',
      paymentDate: '2025-12-31',
      grossAmount: '1000',
    };
    const evt2026: IncomeEventInputData = {
      incomeEventId: 'evt-t-2026',
      incomeType: 'DIVIDEND',
      assetId: 'asset-petr4',
      paymentDate: '2026-01-01',
      grossAmount: '2000',
    };

    const summary2025 = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      events: [evt2025, evt2026],
    });
    const summary2026 = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2026,
      taxSubjectId: 'user-1',
      events: [evt2025, evt2026],
    });

    expect(summary2025.totalGrossIncome.amount).toBe('1000');
    expect(summary2026.totalGrossIncome.amount).toBe('2000');
  });

  // Fixture U — CROSS-USER ISOLATION
  it('Fixture U — CROSS-USER: Independent tax subject execution yields isolated results', () => {
    const user1Evt: IncomeEventInputData = {
      incomeEventId: 'evt-u1',
      incomeType: 'DIVIDEND',
      assetId: 'asset-petr4',
      paymentDate: '2025-08-10',
      grossAmount: '5000',
    };

    const summaryUser1 = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      events: [user1Evt],
    });
    const summaryUser2 = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-2',
      events: [],
    });

    expect(summaryUser1.totalGrossIncome.amount).toBe('5000');
    expect(summaryUser2.totalGrossIncome.amount).toBe('0');
  });

  // Fixture V — MULTI-PAYER TOTAL RECONCILIATION
  it('Fixture V — MULTI-PAYER TOTAL: Sum of all payer subtotals reconciles exactly to totalGrossIncome', () => {
    const events: IncomeEventInputData[] = [
      {
        incomeEventId: 'evt-v1',
        incomeType: 'DIVIDEND',
        assetId: 'asset-petr4',
        payerId: 'asset-petr4',
        payerDisplayName: 'PETROBRAS PN',
        paymentDate: '2025-03-10',
        grossAmount: '3000',
      },
      {
        incomeEventId: 'evt-v2',
        incomeType: 'JCP',
        assetId: 'asset-vale3',
        payerId: 'asset-vale3',
        payerDisplayName: 'VALE ON',
        paymentDate: '2025-03-15',
        grossAmount: '4000',
      },
      {
        incomeEventId: 'evt-v3',
        incomeType: 'FII_INCOME',
        assetId: 'asset-knri11',
        payerId: 'asset-knri11',
        payerDisplayName: 'KINEA RENDA FII',
        paymentDate: '2025-03-20',
        grossAmount: '2500',
        fiiEligibility: { isVerified: true },
      },
    ];

    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2025,
      taxSubjectId: 'user-1',
      events,
    });

    const sumPayers = summary.payers.reduce((acc, p) => acc.add(p.totalGross), Money.zero('BRL'));
    expect(sumPayers.amount).toBe(summary.totalGrossIncome.amount);
    expect(summary.totalGrossIncome.amount).toBe('9500');
  });

  // Fixture W — ZERO VS UNKNOWN WITHHOLDING
  it('Fixture W — ZERO VS UNKNOWN WITHHOLDING: 0.00 withholding is distinct from unverified', () => {
    const unverifiedEvt: IncomeEventInputData = {
      incomeEventId: 'evt-w',
      incomeType: 'FII_INCOME',
      assetId: 'asset-fii-w',
      paymentDate: '2025-09-10',
      grossAmount: '1000',
    };

    const classified = classifyIncomeEvent(unverifiedEvt);
    expect(classified.withheldTaxAmount).toBeNull();
    expect(classified.completenessStatus).toBe('REQUIRES_CONFIRMATION');
  });

  // Fixture X — UNSUPPORTED FOREIGN INCOME
  it('Fixture X — UNSUPPORTED FOREIGN INCOME: Segregates non-BRL income as out of scope', () => {
    const eurEvt: IncomeEventInputData = {
      incomeEventId: 'evt-x',
      incomeType: 'DIVIDEND',
      assetId: 'asset-eur',
      paymentDate: '2025-10-10',
      grossAmount: '200',
      currency: 'EUR',
    };

    const classified = classifyIncomeEvent(eurEvt);
    expect(classified.taxTreatment).toBe('BLOCKED');
    expect(classified.ruleId).toBe('R-FOREIGN-INCOME');
  });

  // Fixture Y — EFFECTIVE-DATE TRANSITION (2025 vs 2026 JCP & Dividend Transition)
  it('Fixture Y — EFFECTIVE-DATE TRANSITION: Seamless rule resolution across 2025/2026', () => {
    const jcp2025: IncomeEventInputData = {
      incomeEventId: 'evt-y1',
      incomeType: 'JCP',
      assetId: 'asset-itub4',
      paymentDate: '2025-12-30',
      grossAmount: '10000',
    };
    const jcp2026: IncomeEventInputData = {
      incomeEventId: 'evt-y2',
      incomeType: 'JCP',
      assetId: 'asset-itub4',
      paymentDate: '2026-01-02',
      grossAmount: '10000',
    };

    const class2025 = classifyIncomeEvent(jcp2025);
    const class2026 = classifyIncomeEvent(jcp2026);

    expect(class2025.ruleId).toBe('R-JCP-2025');
    expect(class2025.withheldTaxAmount?.amount).toBe('1500'); // 15%

    expect(class2026.ruleId).toBe('R-JCP-2026');
    expect(class2026.withheldTaxAmount?.amount).toBe('1750'); // 17.5%
  });

  // ===== NEW FIXTURES Z–AH (Phase 4H.4A.1) =====

  // Fixture Z — THRESHOLD BOUNDARY: R$ 49,999.99
  it('Fixture Z — R$ 49,999.99 BELOW THRESHOLD: no withholding', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-z',
      incomeType: 'DIVIDEND',
      assetId: 'asset-petr4',
      paymentDate: '2026-03-15',
      grossAmount: '49999.99',
    };
    const classified = classifyIncomeEvent(event);
    expect(classified.taxTreatment).toBe('EXEMPT');
    expect(classified.withheldTaxAmount?.amount).toBe('0');
    expect(classified.netAmount.amount).toBe('49999.99');
  });

  // Fixture AA — THRESHOLD BOUNDARY: R$ 50,000.01 (just above — "efeito degrau")
  it('Fixture AA — R$ 50,000.01 JUST ABOVE THRESHOLD: 10% on TOTAL = R$ 5,000.001', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-aa',
      incomeType: 'DIVIDEND',
      assetId: 'asset-petr4',
      paymentDate: '2026-03-15',
      grossAmount: '50000.01',
    };
    const classified = classifyIncomeEvent(event);
    expect(classified.taxTreatment).toBe('WITHHOLDING_EXCLUSIVE');
    expect(classified.ruleId).toBe('R-DIV-2026');
    // 50000.01 * 0.10 = 5000.001
    expect(classified.withheldTaxAmount?.amount).toBe('5000.001');
    expect(classified.netAmount.amount).toBe('45000.009');
  });

  // Fixture AB — R$ 60,000 CANONICAL REGRESSION (spec Section 55 explicit)
  it('Fixture AB — R$ 60,000 REGRESSION: withholding = R$ 6,000 (NOT R$ 1,000)', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-ab',
      incomeType: 'DIVIDEND',
      assetId: 'asset-vale3',
      paymentDate: '2026-04-10',
      grossAmount: '60000',
    };
    const classified = classifyIncomeEvent(event);
    expect(classified.withheldTaxAmount?.amount).toBe('6000');
    expect(classified.netAmount.amount).toBe('54000');
  });

  // Fixture AC — SAME PAYER / THIRD PAYMENT (no double withholding)
  // 30k + 25k + 10k = 65k → total withholding = 6,500 (10% of 65k)
  it('Fixture AC — THREE PAYMENTS SAME PAYER/MONTH: 30k+25k+10k = 65k → R$ 6,500 total withholding', () => {
    const events: IncomeEventInputData[] = [
      {
        incomeEventId: 'evt-ac1',
        incomeType: 'DIVIDEND',
        assetId: 'asset-bbas3',
        payerId: 'asset-bbas3',
        payerDisplayName: 'BANCO DO BRASIL ON',
        paymentDate: '2026-09-05',
        grossAmount: '30000',
      },
      {
        incomeEventId: 'evt-ac2',
        incomeType: 'DIVIDEND',
        assetId: 'asset-bbas3',
        payerId: 'asset-bbas3',
        payerDisplayName: 'BANCO DO BRASIL ON',
        paymentDate: '2026-09-15',
        grossAmount: '25000',
      },
      {
        incomeEventId: 'evt-ac3',
        incomeType: 'DIVIDEND',
        assetId: 'asset-bbas3',
        payerId: 'asset-bbas3',
        payerDisplayName: 'BANCO DO BRASIL ON',
        paymentDate: '2026-09-25',
        grossAmount: '10000',
      },
    ];

    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2026,
      taxSubjectId: 'user-1',
      events,
    });

    expect(summary.dividends.totalGrossAmount.amount).toBe('65000');
    expect(summary.dividends.totalWithheldTax.amount).toBe('6500');
    expect(summary.dividends.totalNetAmount.amount).toBe('58500');
  });

  // Fixture AD — TRANSITION ELIGIBLE (pre-2026 profits with valid evidence)
  it('Fixture AD — TRANSITION ELIGIBLE: 2026 dividend from pre-2026 profits with approval evidence → EXEMPT', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-ad-transition',
      incomeType: 'DIVIDEND',
      assetId: 'asset-petr4',
      payerId: 'asset-petr4',
      payerDisplayName: 'PETROBRAS PN',
      paymentDate: '2026-04-15',
      grossAmount: '80000',
      dividendTransitionEvidence: {
        profitAccrualPeriodEnd: '2025-12-31',
        distributionApprovalDate: '2025-12-20',
        approvalDocumentReference: 'ATA-AGO-2025-12-20',
        eligibilityStatus: 'ELIGIBLE',
        evidenceSource: 'CORPORATE_FILING',
      },
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.ruleId).toBe('R-DIV-TRANSITION');
    expect(classified.taxTreatment).toBe('EXEMPT');
    expect(classified.withheldTaxAmount?.amount).toBe('0');
    expect(classified.netAmount.amount).toBe('80000');
  });

  // Fixture AE — TRANSITION UNKNOWN (missing evidence → fails closed)
  it('Fixture AE — TRANSITION UNKNOWN: No transition evidence → ordinary R-DIV-2026 applies', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-ae-no-transition',
      incomeType: 'DIVIDEND',
      assetId: 'asset-petr4',
      paymentDate: '2026-06-15',
      grossAmount: '80000',
      // No dividendTransitionEvidence → fails closed to ordinary 2026 rule
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.ruleId).toBe('R-DIV-2026');
    expect(classified.taxTreatment).toBe('WITHHOLDING_EXCLUSIVE');
    // 80,000 * 10% = 8,000
    expect(classified.withheldTaxAmount?.amount).toBe('8000');
    expect(classified.netAmount.amount).toBe('72000');
  });

  // Fixture AF — TRANSITION INELIGIBLE (evidence fails → ordinary 2026)
  it('Fixture AF — TRANSITION INELIGIBLE: Explicit INELIGIBLE evidence → ordinary R-DIV-2026', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-af-ineligible',
      incomeType: 'DIVIDEND',
      assetId: 'asset-vale3',
      paymentDate: '2026-07-15',
      grossAmount: '60000',
      dividendTransitionEvidence: {
        profitAccrualPeriodEnd: '2026-06-30', // After 2025 cutoff
        eligibilityStatus: 'INELIGIBLE',
      },
    };

    const classified = classifyIncomeEvent(event);
    expect(classified.ruleId).toBe('R-DIV-2026');
    expect(classified.taxTreatment).toBe('WITHHOLDING_EXCLUSIVE');
    expect(classified.withheldTaxAmount?.amount).toBe('6000');
  });

  // Fixture AG — TRANSITION REQUIRES_CONFIRMATION (incomplete evidence → fails closed)
  it('Fixture AG — TRANSITION REQUIRES_CONFIRMATION: Incomplete evidence → ordinary R-DIV-2026 applies', () => {
    const event: IncomeEventInputData = {
      incomeEventId: 'evt-ag-unconfirmed',
      incomeType: 'DIVIDEND',
      assetId: 'asset-bbas3',
      paymentDate: '2026-08-15',
      grossAmount: '55000',
      dividendTransitionEvidence: {
        eligibilityStatus: 'REQUIRES_CONFIRMATION',
      },
    };

    const classified = classifyIncomeEvent(event);
    // REQUIRES_CONFIRMATION fails closed to ordinary rule
    expect(classified.ruleId).toBe('R-DIV-2026');
    expect(classified.taxTreatment).toBe('WITHHOLDING_EXCLUSIVE');
    expect(classified.withheldTaxAmount?.amount).toBe('5500');
  });

  // Fixture AH — R$ 55,000 SAME PAYER MULTI-PAYMENT (30k + 25k = 55k → 5,500)
  it('Fixture AH — MULTI-PAYMENT CROSSING: 30k + 25k = 55k → R$ 5,500 total withholding', () => {
    const events: IncomeEventInputData[] = [
      {
        incomeEventId: 'evt-ah1',
        incomeType: 'DIVIDEND',
        assetId: 'asset-itub4',
        payerId: 'asset-itub4',
        payerDisplayName: 'ITAU UNIBANCO PN',
        paymentDate: '2026-10-05',
        grossAmount: '30000',
      },
      {
        incomeEventId: 'evt-ah2',
        incomeType: 'DIVIDEND',
        assetId: 'asset-itub4',
        payerId: 'asset-itub4',
        payerDisplayName: 'ITAU UNIBANCO PN',
        paymentDate: '2026-10-20',
        grossAmount: '25000',
      },
    ];

    const summary = buildAnnualInvestmentIncomeSummary({
      calendarYear: 2026,
      taxSubjectId: 'user-1',
      events,
    });

    expect(summary.dividends.totalGrossAmount.amount).toBe('55000');
    expect(summary.dividends.totalWithheldTax.amount).toBe('5500');
    expect(summary.dividends.totalNetAmount.amount).toBe('49500');
  });
});
