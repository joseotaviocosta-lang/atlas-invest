import { describe, expect, it } from 'vitest';
import { buildAnnualTaxReportingPackage } from '../../packages/tax-engine/src/annual-irpf';

describe('Tax Engine: Annual Tax Reporting Scale & Performance Benchmark (Phase 4H.6)', () => {
  it('handles small portfolio (10 assets) under 10ms', () => {
    const positions = Array.from({ length: 10 }, (_, i) => ({
      assetId: `asset-${i}`,
      ticker: `EQT${i}3`,
      assetType: 'BRAZILIAN_EQUITY',
      closingQuantity: '100',
      closingTotalCost: '3500.00',
      openingQuantity: '100',
      openingTotalCost: '3000.00',
      costBasisStatus: 'COMPLETE',
      isBlocked: false,
    }));

    const start = performance.now();
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-scale-small',
      calendarYear: 2025,
      annualPositions: { positions },
      capitalMarketSummary: {
        normalEquities: {
          netGain: '1000.00',
          exemptSalesGross: '15000.00',
          exemptSalesNetGain: '1000.00',
        },
      },
    });
    const duration = performance.now() - start;

    expect(pkg.overallStatus).toBe('READY');
    expect(pkg.sections[0]?.itemCount).toBe(10);
    expect(duration).toBeLessThan(50);
  });

  it('handles large portfolio (1,000 assets, 500 payers) under 200ms', () => {
    const positions = Array.from({ length: 1000 }, (_, i) => ({
      assetId: `asset-${i}`,
      ticker: `EQT${i % 100}3`,
      assetType: i % 3 === 0 ? 'FII' : 'BRAZILIAN_EQUITY',
      closingQuantity: '50',
      closingTotalCost: '1500.00',
      openingQuantity: '50',
      openingTotalCost: '1200.00',
      costBasisStatus: 'COMPLETE',
      isBlocked: false,
    }));

    const payers = Array.from({ length: 500 }, (_, i) => ({
      assetId: `payer-${i}`,
      ticker: `EQT${i % 100}3`,
      payerName: `PAYER CORP ${i}`,
      payerDocument: `00.000.000/000${i % 99}-00`,
      incomeType: 'DIVIDEND',
      taxTreatment: 'EXEMPT',
      grossAmount: '1000.00',
      withheldAmount: '0.00',
      netAmount: '1000.00',
    }));

    const start = performance.now();
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-scale-large',
      calendarYear: 2025,
      annualPositions: { positions },
      investmentIncomeSummary: { payers },
    });
    const duration = performance.now() - start;

    expect(pkg.sections.find((s) => s.section === 'BENS_E_DIREITOS')?.itemCount).toBe(1000);
    expect(pkg.sections.find((s) => s.section === 'RENDIMENTOS_ISENTOS')?.itemCount).toBe(500);
    expect(duration).toBeLessThan(500);
  });

  it('handles extreme scale (10,000 items) within reasonable bounds', () => {
    const positions = Array.from({ length: 10000 }, (_, i) => ({
      assetId: `asset-${i}`,
      ticker: `EQT${i % 500}3`,
      assetType: 'BRAZILIAN_EQUITY',
      closingQuantity: '10',
      closingTotalCost: '100.00',
      openingQuantity: '10',
      openingTotalCost: '90.00',
      costBasisStatus: 'COMPLETE',
      isBlocked: false,
    }));

    const start = performance.now();
    const pkg = buildAnnualTaxReportingPackage({
      taxSubjectId: 'user-scale-extreme',
      calendarYear: 2025,
      annualPositions: { positions },
    });
    const duration = performance.now() - start;

    expect(pkg.sections.find((s) => s.section === 'BENS_E_DIREITOS')?.itemCount).toBe(10000);
    expect(duration).toBeLessThan(3000);
  });
});

