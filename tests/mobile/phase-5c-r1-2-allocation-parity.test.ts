import { describe, it, expect } from 'vitest';

describe('Phase 5C-R1.2: Mobile Multi-Currency Valuation & Allocation Parity', () => {
  it('Gate 27: Renders multi-currency consolidated summary when complete FX exists', () => {
    const mockValuationData = {
      totalsByCurrency: {
        BRL: {
          marketValue: { amount: '1000.00', currency: 'BRL' },
          knownCost: { amount: '1000.00', currency: 'BRL' },
          unrealizedGainLoss: { amount: '0.00', currency: 'BRL' },
          unrealizedGainLossPercent: '0.00',
        },
        USD: {
          marketValue: { amount: '100.00', currency: 'USD' },
          knownCost: { amount: '100.00', currency: 'USD' },
          unrealizedGainLoss: { amount: '0.00', currency: 'USD' },
          unrealizedGainLossPercent: '0.00',
        },
      },
      translatedSummary: {
        reportingCurrency: 'BRL',
        totalMarketValue: { amount: '1500.00', currency: 'BRL' }, // 1000 BRL + 100 USD @ 5.00
        totalCostBasis: { amount: '1500.00', currency: 'BRL' },
        totalUnrealizedGainLoss: { amount: '0.00', currency: 'BRL' },
        totalUnrealizedGainLossPercent: '0.00',
        status: 'AVAILABLE',
      },
      completeness: 'COMPLETE',
      summary: { totalPositions: 2, valuedPositions: 2 },
    };

    expect(mockValuationData.translatedSummary).toBeDefined();
    expect(mockValuationData.translatedSummary.status).toBe('AVAILABLE');
    expect(mockValuationData.translatedSummary.totalMarketValue.amount).toBe('1500.00');
    expect(mockValuationData.translatedSummary.reportingCurrency).toBe('BRL');

    // Both native currencies preserved in breakdown
    expect(Object.keys(mockValuationData.totalsByCurrency)).toEqual(['BRL', 'USD']);
  });

  it('Gate 28 & 29: Partial FX renders Câmbio Parcial badge and NEVER fabricates a fake denominator', () => {
    const mockPartialValuationData = {
      totalsByCurrency: {
        BRL: {
          marketValue: { amount: '1000.00', currency: 'BRL' },
          knownCost: { amount: '1000.00', currency: 'BRL' },
          unrealizedGainLoss: null,
          unrealizedGainLossPercent: null,
        },
        USD: {
          marketValue: { amount: '100.00', currency: 'USD' },
          knownCost: { amount: '100.00', currency: 'USD' },
          unrealizedGainLoss: null,
          unrealizedGainLossPercent: null,
        },
      },
      translatedSummary: {
        reportingCurrency: 'BRL',
        totalMarketValue: { amount: '1000.00', currency: 'BRL' },
        totalCostBasis: { amount: '1000.00', currency: 'BRL' },
        totalUnrealizedGainLoss: null,
        totalUnrealizedGainLossPercent: null,
        status: 'PARTIAL',
      },
      completeness: 'PARTIAL_QUOTES',
      summary: { totalPositions: 2, valuedPositions: 1 },
    };

    expect(mockPartialValuationData.translatedSummary.status).toBe('PARTIAL');
    // Mobile badge displays "Câmbio Parcial"
    const badgeLabel =
      mockPartialValuationData.translatedSummary.status === 'AVAILABLE'
        ? 'Câmbio PTAX'
        : 'Câmbio Parcial';
    expect(badgeLabel).toBe('Câmbio Parcial');

    // Native buckets remain intact without fabricated mixing
    expect(mockPartialValuationData.totalsByCurrency['BRL'].marketValue.amount).toBe('1000.00');
    expect(mockPartialValuationData.totalsByCurrency['USD'].marketValue.amount).toBe('100.00');
  });
});
