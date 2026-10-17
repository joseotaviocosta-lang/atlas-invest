import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  computeEquityMonthlyTaxCore,
  buildAnnualPositionReport,
  createTaxSubjectId,
  type EquitySellLeg,
} from '@atlas/tax-engine';
import {
  createPortfolioId,
  createAccountId,
  createAssetId,
  TransactionFactory,
} from '@atlas/domain';

describe('Phase 5B: Benchmark and Historical Market-Data Isolation from Fiscal Domain', () => {
  it('Assertion 1: Tax engine strictly does not depend on @atlas/benchmark-engine or benchmark tables', () => {
    const taxEnginePackageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../packages/tax-engine/package.json'), 'utf8'),
    );

    const dependencies = Object.keys(taxEnginePackageJson.dependencies || {});
    expect(dependencies).not.toContain('@atlas/benchmark-engine');
    expect(dependencies).not.toContain('@atlas/market-data');
    expect(dependencies).not.toContain('@atlas/valuation-engine');
    expect(dependencies).not.toContain('@atlas/database');

    // Scan tax-engine src files for benchmark leaks
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
            content.includes('@atlas/benchmark-engine') ||
            content.includes('BenchmarkObservation') ||
            content.includes('benchmark_observations') ||
            content.includes('IBOV') ||
            content.includes('CDI')
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

  it('Assertion 2: Monthly equity fiscal calculation is 100% invariant to benchmark levels or historical index backfills', () => {
    const sellLeg: EquitySellLeg = {
      legId: 'leg-1',
      assetId: 'asset-test-petr4',
      classification: 'NORMAL',
      quantity: '100',
      grossAmount: '3800.00',
      costBasis: '3000.00',
      assetEligibility: 'ELIGIBLE_EQUITY',
    };

    const res = computeEquityMonthlyTaxCore({
      taxSubjectId: 'subject-1',
      competence: '2026-10',
      sellLegs: [sellLeg],
      openingNormalLoss: '0',
      openingDayTradeLoss: '0',
    });

    expect(res.exemption.status).toBe('EXEMPT');
    expect(res.normal.grossSales).toBe('3800');
    expect(res.normal.taxableBaseBeforeRate).toBe('0');
    expect(res.overallStatus).toBe('COMPLETE');
  });

  it('Assertion 3: Annual Declaration Bens e Direitos uses strictly acquisition cost basis, unaffected by benchmark performance', () => {
    const taxSubjectId = createTaxSubjectId('00000000-0000-4000-8000-000000000001');
    const portfolioId = createPortfolioId('00000000-0000-4000-8000-000000000002');
    const accountId = createAccountId('00000000-0000-4000-8000-000000000003');
    const assetId = createAssetId('00000000-0000-4000-8000-000000000004');

    const tx = TransactionFactory.createBuy({
      id: '00000000-0000-4000-8000-000000000005',
      portfolioId: String(portfolioId),
      accountId: String(accountId),
      assetId: String(assetId),
      tradeDate: '2025-05-10',
      quantity: '100',
      unitPrice: '30.00',
      currency: 'BRL',
    });

    const report = buildAnnualPositionReport({
      taxSubjectId,
      portfolioId,
      calendarYear: 2025,
      transactions: [tx],
    });

    expect(report.positions).toHaveLength(1);
    const petr4 = report.positions[0]!;
    expect(petr4.quantity.toString()).toBe('100');
    expect(petr4.totalHistoricalCost?.amount).toBe('3000');
    expect(petr4.averageHistoricalCost?.amount).toBe('30');
    expect(petr4.completenessStatus).toBe('COMPLETE');
    expect(petr4.costBasisStatus).toBe('KNOWN');
  });
});
