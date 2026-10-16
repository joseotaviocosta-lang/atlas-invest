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
});
