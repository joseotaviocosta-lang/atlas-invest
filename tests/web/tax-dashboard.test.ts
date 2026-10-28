import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { apiClient } from '@/api/client';
import {
  mapToMonthlyTaxLiabilityViewModel,
  mapToTaxObligationViewModel,
  type RawMonthlyTaxLiability,
  type RawTaxObligation,
} from '@atlas/ui';

const DASHBOARD_CARD = 'apps/web/src/components/fiscal/TaxDashboardSummaryCard.tsx';
const TAX_PAGE = 'apps/web/src/app/(app)/tax/page.tsx';
const TODAY_PAGE = 'apps/web/src/app/(app)/today/page.tsx';

describe('Web: Tax Dashboard Completion (Phase 5J)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const sampleLiability: RawMonthlyTaxLiability = {
    competence: '2026-09',
    status: 'COMPLETE',
    ruleVersions: ['BR_EQUITY_2026_V1'],
    categories: [
      {
        category: 'BRAZILIAN_EQUITY',
        currency: 'BRL',
        status: 'COMPLETE',
        ruleVersion: 'BR_EQUITY_2026_V1',
        ruleSetStatus: 'PRODUCTION_VERIFIED',
        grossSales: { amount: '35000.00', currency: 'BRL' },
        realizedResult: { amount: '2301.33', currency: 'BRL' },
        taxableBaseBeforeLosses: { amount: '2301.33', currency: 'BRL' },
        openingLossBalance: { amount: '0.00', currency: 'BRL' },
        lossApplied: { amount: '0.00', currency: 'BRL' },
        lossGenerated: { amount: '0.00', currency: 'BRL' },
        closingLossBalance: { amount: '0.00', currency: 'BRL' },
        taxableBaseAfterLosses: { amount: '2301.33', currency: 'BRL' },
        ratePercentage: '15',
        taxBeforeWithholding: { amount: '345.20', currency: 'BRL' },
        withholdingApplied: { amount: '0.00', currency: 'BRL' },
        taxDue: { amount: '345.20', currency: 'BRL' },
        qualityIssues: [],
        trace: [],
      },
    ],
    totalTaxBeforeCredits: { amount: '345.20', currency: 'BRL' },
    creditsApplied: { amount: '0.00', currency: 'BRL' },
    taxDue: { amount: '345.20', currency: 'BRL' },
    openingLossBalances: [],
    closingLossBalances: [],
    dataQuality: { status: 'COMPLETE', issues: [], issueCount: 0 },
    capabilities: {
      foundationOnly: false,
      productionRuleVerified: true,
      withholdingSupported: true,
      taxLiabilitySupported: true,
    },
    calculationVersion: 'tax-calc-v1',
    engineVersion: '1.0.0',
    limitations: [],
    traceSummary: [],
  };

  const sampleObligation: RawTaxObligation = {
    id: 'ob-1',
    competence: '2026-09',
    taxBucket: 'FII_SALE',
    revenueCode: '6015',
    status: 'OPEN',
    baseStatus: 'OPEN',
    reasonCode: null,
    principalAmount: { amount: '345.20', currency: 'BRL' },
    currency: 'BRL',
    dueDate: '2026-10-30',
    darfReadiness: 'READY',
    darfReadinessReason: null,
    dataQuality: 'COMPLETE',
    liabilityFingerprint: 'abc1234567890',
    revision: 1,
    deadline: null,
    darfPreparation: null,
    payments: [],
    supersededById: null,
    createdAt: '2026-09-30T12:00:00.000Z',
  };

  it('wires the TaxDashboardSummaryCard into the fiscal page', () => {
    const pageContent = fs.readFileSync(path.join(process.cwd(), TAX_PAGE), 'utf8');
    const cardContent = fs.readFileSync(path.join(process.cwd(), DASHBOARD_CARD), 'utf8');
    expect(pageContent).toContain('TaxDashboardSummaryCard');
    expect(cardContent).toContain('taxObligationQueryKey(competence)');
    expect(cardContent).toContain('mapToTaxObligationViewModel');
  });

  it('TaxDashboardSummaryCard enforces zero client-side fiscal arithmetic', () => {
    const cardContent = fs.readFileSync(path.join(process.cwd(), DASHBOARD_CARD), 'utf8');
    expect(cardContent).not.toMatch(/parseFloat\(/);
    expect(cardContent).not.toMatch(/calculateTax|computeTax|computeDue/i);
    expect(cardContent).not.toMatch(/new\s+Decimal\(/);
  });

  it('presents all 4 executive metrics answering core investor questions', () => {
    const cardContent = fs.readFileSync(path.join(process.cwd(), DASHBOARD_CARD), 'utf8');
    expect(cardContent).toContain('tax-metric-calculated-tax');
    expect(cardContent).toContain('tax-metric-darf-due');
    expect(cardContent).toContain('tax-metric-losses-compensated');
    expect(cardContent).toContain('tax-metric-data-quality');
    expect(cardContent).toContain('tax-calculation-flow-strip');
  });

  it('links blocked or data quality issues to maintenance and review surfaces', () => {
    const cardContent = fs.readFileSync(path.join(process.cwd(), DASHBOARD_CARD), 'utf8');
    expect(cardContent).toContain('/portfolio/maintenance');
    expect(cardContent).toContain('/reviews');
    expect(cardContent).toContain('tax-data-quality-alert-banner');
  });

  it('provides month navigation triggers (prev/next month)', () => {
    const cardContent = fs.readFileSync(path.join(process.cwd(), DASHBOARD_CARD), 'utf8');
    expect(cardContent).toContain('tax-prev-month-button');
    expect(cardContent).toContain('tax-next-month-button');
    expect(cardContent).toContain('tax-competence-month-input');
  });

  it('maps positive tax and DARF balance faithfully from server view models', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: sampleLiability }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: sampleObligation }),
      });
    global.fetch = mockFetch as unknown as typeof fetch;

    const resLiability = await apiClient.get<{ data: RawMonthlyTaxLiability }>(
      '/api/v1/fiscal/monthly/2026-09/liability',
    );
    const resObligation = await apiClient.get<{ data: RawTaxObligation }>(
      '/api/v1/fiscal/monthly/2026-09/obligation',
    );

    const vmL = mapToMonthlyTaxLiabilityViewModel(resLiability.data)!;
    const vmO = mapToTaxObligationViewModel(resObligation.data)!;

    expect(vmL.isComplete).toBe(true);
    expect(vmL.taxDueFormatted).toBe('R$ 345,20');
    expect(vmO.principalFormatted).toBe('R$ 345,20');
    expect(vmO.darfReadiness).toBe('READY');
    expect(vmO.dueDateFormatted).toBe('30/10/2026');
  });

  it('distinguishes calculated zero from missing/blocked tax data', async () => {
    const zeroLiability: RawMonthlyTaxLiability = {
      ...sampleLiability,
      taxDue: { amount: '0.00', currency: 'BRL' },
    };

    const blockedLiability: RawMonthlyTaxLiability = {
      ...sampleLiability,
      status: 'BLOCKED',
      taxDue: null,
      dataQuality: { status: 'BLOCKED', issues: ['MISSING_RULE_SET'], issueCount: 1 },
    };

    const vmZero = mapToMonthlyTaxLiabilityViewModel(zeroLiability)!;
    const vmBlocked = mapToMonthlyTaxLiabilityViewModel(blockedLiability)!;

    expect(vmZero.hasTaxDue).toBe(true);
    expect(vmZero.taxDueFormatted).toBe('R$ 0,00');

    expect(vmBlocked.isBlocked).toBe(true);
    expect(vmBlocked.hasTaxDue).toBe(false);
    expect(vmBlocked.taxDueFormatted).toBe('—');
  });

  it('integrates a compact next fiscal obligation preview on /today', () => {
    const todayContent = fs.readFileSync(path.join(process.cwd(), TODAY_PAGE), 'utf8');
    expect(todayContent).toContain('/api/v1/fiscal/monthly/${currentMonthKey}/obligation');
    expect(todayContent).toContain('today-tax-obligation-callout');
    expect(todayContent).toContain('href="/tax"');
    expect(todayContent).toContain('Próxima obrigação tributária');
  });

  it('includes scope disclaimer on Annual DIRPF tab (no false declaration completeness claims)', () => {
    const pageContent = fs.readFileSync(path.join(process.cwd(), TAX_PAGE), 'utf8');
    expect(pageContent).toContain('annual-tax-scope-card');
    expect(pageContent).toContain('Escopo dos Dados de Investimentos para a Declaração Anual');
    expect(pageContent).toContain('informações de investimentos e renda variável');
    expect(pageContent).not.toMatch(/declaração\s+pronta/i);
  });
});
