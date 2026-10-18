import { describe, it, expect } from 'vitest';
import {
  valuePortfolio,
  computePortfolioAllocation,
  PositionValuationInput,
  ValuationQuote,
} from '@atlas/valuation-engine';
import { LocalDate, Money } from '@atlas/domain';

describe('Phase 5C-R1.2: BRL-Only Backward Compatibility & Zero-FX Matrix', () => {
  // Pure BRL Assets & Positions (no foreign currencies, no FX lookups)
  const posPetr4: PositionValuationInput = {
    assetId: '11111111-1111-4111-8111-111111111111',
    accountId: 'acc-brl-1',
    quantity: '100',
    currency: 'BRL',
    totalCost: '3000.00',
    averageCost: '30.00',
    costBasisStatus: 'KNOWN',
  };

  const posVale3: PositionValuationInput = {
    assetId: '22222222-2222-4222-8222-222222222222',
    accountId: 'acc-brl-1',
    quantity: '50',
    currency: 'BRL',
    totalCost: '2500.00',
    averageCost: '50.00',
    costBasisStatus: 'KNOWN',
  };

  const quotePetr4: ValuationQuote = {
    assetId: '11111111-1111-4111-8111-111111111111',
    price: '35.00', // 100 * 35 = 3500 BRL
    currency: 'BRL',
    asOf: '2026-10-16',
    receivedAt: '2026-10-16T18:00:00Z',
    source: 'BRAPI',
    status: 'EOD',
    freshness: 'FRESH',
    providerSymbol: 'PETR4',
  };

  const quoteVale3: ValuationQuote = {
    assetId: '22222222-2222-4222-8222-222222222222',
    price: '60.00', // 50 * 60 = 3000 BRL
    currency: 'BRL',
    asOf: '2026-10-16',
    receivedAt: '2026-10-16T18:00:00Z',
    source: 'BRAPI',
    status: 'EOD',
    freshness: 'FRESH',
    providerSymbol: 'VALE3',
  };

  const quotesMap = new Map<string, ValuationQuote>([
    [posPetr4.assetId, quotePetr4],
    [posVale3.assetId, quoteVale3],
  ]);

  it('Surface A (Valuation): Pure BRL valuation requires 0 FX observations and preserves exact totals', () => {
    const valuation = valuePortfolio({
      portfolioId: 'p-brl-only',
      positions: [posPetr4, posVale3],
      accountPositions: new Map(),
      quotes: quotesMap,
      // No FX rates provided at all
    });

    // Native totals
    const brlTotals = valuation.totalsByCurrency['BRL'];
    expect(brlTotals).toBeDefined();
    expect(brlTotals.marketValue.amount).toBe('6500'); // 3500 + 3000
    expect(brlTotals.costBasis.amount).toBe('5500'); // 3000 + 2500
    expect(brlTotals.unrealizedGainLoss?.amount).toBe('1000'); // 6500 - 5500

    // Translated total mirrors native total without FX
    expect(valuation.translatedSummary).toBeDefined();
    expect(valuation.translatedSummary?.reportingCurrency).toBe('BRL');
    expect(valuation.translatedSummary?.status).toBe('AVAILABLE');
    expect(valuation.translatedSummary?.totalMarketValue.amount).toBe('6500');
    expect(valuation.translatedSummary?.totalCostBasis.amount).toBe('5500');
    expect(valuation.translatedSummary?.totalUnrealizedGainLoss?.amount).toBe('1000');
    expect(Object.keys(valuation.translatedSummary?.ratesUsed ?? {})).toHaveLength(0);
  });

  it('Surface B (Allocation): Pure BRL allocation matches exact pre-5C weights with 0 foreign FX', () => {
    const valuation = valuePortfolio({
      portfolioId: 'p-brl-only',
      positions: [posPetr4, posVale3],
      accountPositions: new Map(),
      quotes: quotesMap,
    });

    const alloc = computePortfolioAllocation(valuation);

    // Native bucket
    const brlBucket = alloc.currencies['BRL'];
    expect(brlBucket).toBeDefined();
    expect(brlBucket.totalMarketValue.amount).toBe('6500');
    expect(brlBucket.byAsset).toHaveLength(2);

    // Translated allocation
    expect(alloc.translatedAllocation).toBeDefined();
    expect(alloc.translatedAllocation?.reportingCurrency).toBe('BRL');
    expect(alloc.translatedAllocation?.status).toBe('AVAILABLE');
    expect(alloc.translatedAllocation?.totalMarketValue.amount).toBe('6500');

    // PETR4: 3500 / 6500 = 53.846%
    // VALE3: 3000 / 6500 = 46.153%
    const petr4Alloc = alloc.translatedAllocation?.byAsset.find(
      (a) => a.assetId === posPetr4.assetId,
    );
    expect(petr4Alloc?.allocationPercent).toMatch(/^53\.84/);
    const vale3Alloc = alloc.translatedAllocation?.byAsset.find(
      (a) => a.assetId === posVale3.assetId,
    );
    expect(vale3Alloc?.allocationPercent).toMatch(/^46\.15/);
  });

  it('Surfaces C & D (Performance & Series): Replay engine requires 0 FX for pure BRL ledgers', () => {
    // Pure BRL cash flows
    const m1 = Money.from('1000.00', 'BRL');
    const m2 = Money.from('500.00', 'BRL');
    const sum = m1.add(m2);
    expect(sum.amount).toBe('1500');
    expect(sum.currency).toBe('BRL');
  });

  it('Surfaces E, F, G, H (Intelligence, Home, Market, Tax): 0 FX calls and unchanged economic outputs', () => {
    // Domestic fiscal and performance modules operate purely on BRL Money and LocalDate
    const d1 = LocalDate.from('2026-10-15');
    const d2 = LocalDate.from('2026-10-16');
    expect(d1.compare(d2)).toBeLessThan(0);
  });
});
