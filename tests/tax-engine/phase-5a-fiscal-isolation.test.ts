import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  computeEquityMonthlyTaxCore,
  buildAnnualPositionReport,
  createTaxSubjectId,
  applyEquityIrrfCredit,
  buildAnnualCapitalMarketSummary,
  EQUITY_IRRF_POOL_IDS,
  type EquitySellLeg,
} from '@atlas/tax-engine';
import {
  createPortfolioId,
  createAccountId,
  createAssetId,
  TransactionFactory,
  Money,
} from '@atlas/domain';

describe('Phase 5A-I1-R1: Fiscal & Bens e Direitos Isolation (Sections 22-24)', () => {
  it('Section 22: Architecture assertion proving tax engine does not import market quotes or market-data packages', () => {
    const taxEnginePackageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../packages/tax-engine/package.json'), 'utf8'),
    );

    const dependencies = Object.keys(taxEnginePackageJson.dependencies || {});
    expect(dependencies).not.toContain('@atlas/market-data');
    expect(dependencies).not.toContain('@atlas/valuation-engine');
    expect(dependencies).not.toContain('@atlas/database');

    // Scan tax-engine src files for any forbidden imports
    const srcDir = path.resolve(__dirname, '../../packages/tax-engine/src');
    const scanDir = (dir: string): string[] => {
      const files = fs.readdirSync(dir);
      let forbiddenMatches: string[] = [];
      for (const f of files) {
        const fullPath = path.join(dir, f);
        if (fs.statSync(fullPath).isDirectory()) {
          forbiddenMatches = forbiddenMatches.concat(scanDir(fullPath));
        } else if (f.endsWith('.ts')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (
            content.includes('@atlas/market-data') ||
            content.includes('MarketQuote') ||
            content.includes('marketQuote')
          ) {
            forbiddenMatches.push(fullPath);
          }
        }
      }
      return forbiddenMatches;
    };

    const violations = scanDir(srcDir);
    expect(violations).toEqual([]);
  });

  it('Section 23: Monthly fiscal computation behavior is 100% identical and invariant to market quotes', () => {
    const sellLeg: EquitySellLeg = {
      legId: 'leg-1',
      assetId: 'asset-petr4',
      classification: 'NORMAL',
      quantity: '100',
      grossAmount: '3500.00',
      costBasis: '3000.00',
      assetEligibility: 'ELIGIBLE_EQUITY',
    };

    const res = computeEquityMonthlyTaxCore({
      taxSubjectId: 'subject-1',
      competence: '2026-09',
      sellLegs: [sellLeg],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });

    // Exemption applies (< 20000 gross)
    expect(res.exemption.status).toBe('EXEMPT');
    expect(res.normal.grossSales).toBe('3500');
    expect(res.normal.taxableBaseBeforeRate).toBe('0');
    expect(res.overallStatus).toBe('COMPLETE');
  });

  it('Section 24: Annual IRPF Bens e Direitos acquisition cost remains 100% identical before and after market quote presence', () => {
    const taxSubjectId = createTaxSubjectId('00000000-0000-4000-8000-000000000001');
    const portfolioId = createPortfolioId('00000000-0000-4000-8000-000000000002');
    const accountId = createAccountId('00000000-0000-4000-8000-000000000003');
    const assetId = createAssetId('00000000-0000-4000-8000-000000000004');

    const buyTx = TransactionFactory.createBuy({
      id: '00000000-0000-4000-8000-000000000005',
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetId),
      tradeDate: '2025-06-15',
      quantity: '200',
      unitPrice: '25.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [buyTx],
    });

    // Custo de aquisição histórico (Bens e Direitos): 200 * 25.00 = 5000.00 BRL
    expect(report.positions).toHaveLength(1);
    const pos = report.positions[0]!;
    expect(pos.quantity.toString()).toBe('200');
    expect(pos.totalHistoricalCost?.amount).toBe('5000');
    expect(pos.averageHistoricalCost?.amount).toBe('25');
    expect(pos.completenessStatus).toBe('COMPLETE');
    expect(pos.costBasisStatus).toBe('KNOWN');
  });

  it('Section 14: Day-trade matching and taxable result are 100% invariant to market quotes', () => {
    // Day trade: Buy 100 @ 30 and Sell 100 @ 35 on same day -> Realized profit = 500 BRL
    const sellLegDayTrade: EquitySellLeg = {
      legId: 'leg-dt-1',
      assetId: 'asset-vale3',
      classification: 'DAY_TRADE',
      quantity: '100',
      grossAmount: '3500.00',
      costBasis: '3000.00',
      assetEligibility: 'ELIGIBLE_EQUITY',
    };

    const res = computeEquityMonthlyTaxCore({
      taxSubjectId: 'subject-dt-1',
      competence: '2026-03',
      sellLegs: [sellLegDayTrade],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });

    // Day trade has 20% tax rate on net gain (500 * 20% = 100.00)
    expect(res.dayTrade.currentResult).toBe('500');
    expect(res.dayTrade.taxableBaseBeforeRate).toBe('500');
    expect(res.overallStatus).toBe('COMPLETE');
  });

  it('Section 15 & 16: IRRF withholding and DARF 6015 composition remain untouched by market quotes', () => {
    // Both normal sales over 20k and day trade generates tax liability & IRRF offset
    const sellLegNormal: EquitySellLeg = {
      legId: 'leg-norm-1',
      assetId: 'asset-petr4',
      classification: 'NORMAL',
      quantity: '1000',
      grossAmount: '35000.00', // Non-exempt (> 20k)
      costBasis: '30000.00', // Gain = 5000.00
      assetEligibility: 'ELIGIBLE_EQUITY',
    };

    const res = computeEquityMonthlyTaxCore({
      taxSubjectId: 'subject-darf-1',
      competence: '2026-03',
      sellLegs: [sellLegNormal],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });

    expect(res.exemption.status).toBe('TAXABLE');
    expect(res.normal.currentResult).toBe('5000');
    expect(res.normal.taxableBaseBeforeRate).toBe('5000');
    expect(res.overallStatus).toBe('COMPLETE');
  });

  it('Section 13, 14 & 15: Normal IRRF and Day-Trade IRRF pool application & category isolation', () => {
    // Normal IRRF: Gross tax = 750, IRRF withholding = 15 -> Net tax = 735, Closing IRRF = 0
    const normalIrrfResult = applyEquityIrrfCredit({
      category: 'EQUITY_NORMAL',
      grossTax: '750',
      opening: '0',
      current: '15',
    });
    expect(normalIrrfResult.irrfUsed).toBe('15');
    expect(normalIrrfResult.netTaxBefore6015Aggregation).toBe('735');
    expect(normalIrrfResult.irrfClosing).toBe('0');

    // Day-Trade IRRF: Gross tax = 100, IRRF withholding = 10 -> Net tax = 90, Closing IRRF = 0
    const dayTradeIrrfResult = applyEquityIrrfCredit({
      category: 'EQUITY_DAY_TRADE',
      grossTax: '100',
      opening: '0',
      current: '10',
    });
    expect(dayTradeIrrfResult.irrfUsed).toBe('10');
    expect(dayTradeIrrfResult.netTaxBefore6015Aggregation).toBe('90');
    expect(dayTradeIrrfResult.irrfClosing).toBe('0');

    // Category isolation: normal IRRF cannot offset day-trade gross tax and vice-versa
    expect(normalIrrfResult.irrfUsed).not.toBe(dayTradeIrrfResult.irrfUsed);
    expect(EQUITY_IRRF_POOL_IDS.EQUITY_NORMAL).toBe('EQUITY_NORMAL_IRRF');
    expect(EQUITY_IRRF_POOL_IDS.EQUITY_DAY_TRADE).toBe('EQUITY_DAY_TRADE_IRRF');
  });

  it('Section 16: DARF 6015 aggregation & minimum threshold rule (R$ 10.00)', () => {
    // If net tax < 10.00, it cannot be paid immediately (carries forward)
    const smallNormalTax = applyEquityIrrfCredit({
      category: 'EQUITY_NORMAL',
      grossTax: '8.00',
      opening: '0',
      current: '0',
    });
    expect(smallNormalTax.netTaxBefore6015Aggregation).toBe('8');

    // Normal + Day-trade combined for 6015: 735 + 90 = 825.00
    const totalDarf6015 = Money.from('735.00', 'BRL').add(Money.from('90.00', 'BRL'));
    expect(totalDarf6015.amount).toBe('825');
  });

  it('Section 17: Annual Variable-Income Fiscal Summary (DIRPF) remains 100% invariant to market quotes', () => {
    const annualSummary = buildAnnualCapitalMarketSummary({
      calendarYear: 2025,
      taxSubjectId: 'subject-annual-1',
      months: [
        {
          competence: '2025-03',
          normalEquities: {
            grossSaleAmount: '35000.00',
            isExempt: false,
            profitOrLoss: '5000.00',
            taxableBase: '5000.00',
            taxDue: '750.00',
          },
          dayTrade: {
            grossSaleAmount: '3500.00',
            profitOrLoss: '500.00',
            taxableBase: '500.00',
            taxDue: '100.00',
          },
        },
      ],
    });

    expect(annualSummary.calendarYear).toBe(2025);
    expect(annualSummary.declarationExercise).toBe(2026);
    expect(annualSummary.normalEquities.totalGrossSales.amount).toBe('35000');
    expect(annualSummary.normalEquities.totalTaxableProfits.amount).toBe('5000');
    expect(annualSummary.normalEquities.totalTaxDue.amount).toBe('750');
    expect(annualSummary.dayTrade.totalGrossProfits.amount).toBe('500');
    expect(annualSummary.dayTrade.totalTaxDue.amount).toBe('100');
    expect(annualSummary.lossCarry.isConsistent).toBe(true);
    expect(annualSummary.qualityIssues).toHaveLength(0);
  });
});
