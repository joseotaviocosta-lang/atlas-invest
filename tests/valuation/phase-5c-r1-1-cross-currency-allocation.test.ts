import { describe, it, expect } from 'vitest';
import {
  valuePortfolio,
  computePortfolioAllocation,
  PositionValuationInput,
  ValuationQuote,
  ValuationFxRate,
} from '@atlas/valuation-engine';

describe('Phase 5C-R1.1 Cross-Currency Allocation', () => {
  const assetBrl1: PositionValuationInput = {
    assetId: '11111111-1111-4111-8111-111111111111',
    accountId: 'acc-brl-1',
    quantity: '100',
    currency: 'BRL',
    totalCost: '1000.00',
    averageCost: '10.00',
    costBasisStatus: 'KNOWN',
  };

  const assetUsd1: PositionValuationInput = {
    assetId: '22222222-2222-4222-8222-222222222222',
    accountId: 'acc-usd-1',
    quantity: '10',
    currency: 'USD',
    totalCost: '500.00',
    averageCost: '50.00',
    costBasisStatus: 'KNOWN',
  };

  const quoteBrl1: ValuationQuote = {
    assetId: '11111111-1111-4111-8111-111111111111',
    price: '10.00',
    currency: 'BRL',
    asOf: '2026-10-16',
    receivedAt: '2026-10-16T18:00:00Z',
    source: 'TEST',
    status: 'EOD',
    freshness: 'FRESH',
    providerSymbol: 'PETR4',
  };

  const quoteUsd1: ValuationQuote = {
    assetId: '22222222-2222-4222-8222-222222222222',
    price: '10.00', // 10 * 10 = 100 USD
    currency: 'USD',
    asOf: '2026-10-16',
    receivedAt: '2026-10-16T18:00:00Z',
    source: 'TEST',
    status: 'EOD',
    freshness: 'FRESH',
    providerSymbol: 'AAPL',
  };

  const quotesMap = new Map<string, ValuationQuote>([
    [assetBrl1.assetId, quoteBrl1],
    [assetUsd1.assetId, quoteUsd1],
  ]);

  const fxRateUsdBrl: ValuationFxRate = {
    baseCurrency: 'USD',
    quoteCurrency: 'BRL',
    rate: '5.00', // 100 USD * 5.00 = 500 BRL
    rateDate: '2026-10-16',
    source: 'BCB_PTAX',
  };

  const fxRatesMap = new Map<string, ValuationFxRate>([['USD::BRL', fxRateUsdBrl]]);

  it('Gate 4 & Gate 8: Computes exact normalized translatedAllocation when all FX rates are complete', () => {
    // 1000 BRL (asset 1) + 100 USD @ 5.00 = 500 BRL (asset 2) => Total translated = 1500 BRL
    // asset 1: 1000 / 1500 = 66.666...%
    // asset 2: 500 / 1500 = 33.333...%
    const valuation = valuePortfolio({
      portfolioId: 'p-test',
      positions: [assetBrl1, assetUsd1],
      accountPositions: new Map(),
      quotes: quotesMap,
      reportingCurrency: 'BRL',
      fxRates: fxRatesMap,
    });

    expect(valuation.translatedSummary).toBeDefined();
    expect(valuation.translatedSummary?.status).toBe('AVAILABLE');
    expect(valuation.translatedSummary?.totalMarketValue.amount).toBe('1500');

    const allocation = computePortfolioAllocation(valuation);

    // Native buckets preserved
    expect(allocation.currencies['BRL']).toBeDefined();
    expect(allocation.currencies['BRL'].totalMarketValue.amount).toBe('1000');
    expect(allocation.currencies['BRL'].byAsset[0].allocationPercent).toBe('100');
    expect(allocation.currencies['USD']).toBeDefined();
    expect(allocation.currencies['USD'].totalMarketValue.amount).toBe('100');
    expect(allocation.currencies['USD'].byAsset[0].allocationPercent).toBe('100');

    // Translated allocation
    expect(allocation.translatedAllocation).toBeDefined();
    const trans = allocation.translatedAllocation!;
    expect(trans.reportingCurrency).toBe('BRL');
    expect(trans.status).toBe('AVAILABLE');
    expect(trans.totalMarketValue.amount).toBe('1500');

    expect(trans.byAsset).toHaveLength(2);
    const itemBrl = trans.byAsset.find((a) => a.assetId === assetBrl1.assetId)!;
    expect(itemBrl.nativeCurrency).toBe('BRL');
    expect(itemBrl.nativeMarketValue.amount).toBe('1000');
    expect(itemBrl.reportingMarketValue.amount).toBe('1000');
    expect(itemBrl.allocationPercent).toMatch(/^66\.66/);

    const itemUsd = trans.byAsset.find((a) => a.assetId === assetUsd1.assetId)!;
    expect(itemUsd.nativeCurrency).toBe('USD');
    expect(itemUsd.nativeMarketValue.amount).toBe('100');
    expect(itemUsd.reportingMarketValue.amount).toBe('500');
    expect(itemUsd.allocationPercent).toMatch(/^33\.33/);
  });

  it('Gate 5 & Gate 9: Partial FX suppresses cross-currency normalization and NEVER fabricates a 100% denominator', () => {
    // When FX rate for USD is missing:
    const valuation = valuePortfolio({
      portfolioId: 'p-test',
      positions: [assetBrl1, assetUsd1],
      accountPositions: new Map(),
      quotes: quotesMap,
      reportingCurrency: 'BRL',
      fxRates: new Map(), // Missing USD/BRL rate
    });

    expect(valuation.translatedSummary).toBeDefined();
    expect(valuation.translatedSummary?.status).toBe('PARTIAL');
    expect(valuation.translatedSummary?.untranslatedCurrencies).toContain('USD');

    const allocation = computePortfolioAllocation(valuation);

    // Native per-currency buckets are 100% intact and unaffected
    expect(allocation.currencies['BRL'].totalMarketValue.amount).toBe('1000');
    expect(allocation.currencies['BRL'].byAsset[0].allocationPercent).toBe('100');
    expect(allocation.currencies['USD'].totalMarketValue.amount).toBe('100');
    expect(allocation.currencies['USD'].byAsset[0].allocationPercent).toBe('100');

    // Translated allocation has PARTIAL status
    expect(allocation.translatedAllocation).toBeDefined();
    const trans = allocation.translatedAllocation!;
    expect(trans.reportingCurrency).toBe('BRL');
    expect(trans.status).toBe('PARTIAL');

    // Crucial anti-fabrication invariant:
    // allocationPercent MUST be '0' for items because total portfolio denominator cannot be known
    // BRL alone cannot be represented as 100% of the portfolio!
    for (const item of trans.byAsset) {
      expect(item.allocationPercent).toBe('0');
    }
    for (const cls of trans.byAssetClass) {
      expect(cls.allocationPercent).toBe('0');
    }
  });

  it('Gate 6 & Gate 7: BRL-only portfolio produces no multi-currency distortion and remains 100% backward compatible', () => {
    const valuation = valuePortfolio({
      portfolioId: 'p-test',
      positions: [assetBrl1],
      accountPositions: new Map(),
      quotes: quotesMap,
      // No reportingCurrency provided and single currency (pure BRL-only native mode)
    });

    expect(valuation.translatedSummary?.status).toBe('AVAILABLE');

    const allocation = computePortfolioAllocation(valuation);

    expect(allocation.currencies['BRL'].totalMarketValue.amount).toBe('1000');
    expect(allocation.currencies['BRL'].byAsset[0].allocationPercent).toBe('100');
    expect(allocation.translatedAllocation).toBeDefined();
    expect(allocation.translatedAllocation?.reportingCurrency).toBe('BRL');
    expect(allocation.translatedAllocation?.totalMarketValue.amount).toBe('1000');
    expect(allocation.translatedAllocation?.byAsset[0].allocationPercent).toBe('100');
  });
});
