import { describe, it, expect } from 'vitest';
import {
  buildPortfolioIntelligenceSummary,
  CurrencyIntelligenceInput,
  PortfolioIntelligenceInput,
} from '@atlas/portfolio-intelligence';
import {
  extractAssetFacts,
  buildPortfolioAssetAiGroundingContext,
  AssetPositionCanonicalData,
  classifyConversationIntent,
  validateGroundedClaims,
  renderValidatedClaims,
  GroundedClaimInput,
} from '@atlas/ai-engine';

function currencyInput(
  overrides: Partial<CurrencyIntelligenceInput> = {},
): CurrencyIntelligenceInput {
  return {
    currency: 'BRL',
    overview: {
      currentMarketValue: '100000',
      positionCount: 2,
      valuedPositionCount: 2,
      unvaluedPositionCount: 0,
      status: 'AVAILABLE',
    },
    performance: { twr: '12', xirr: '11.5', observationCount: 200, status: 'AVAILABLE' },
    benchmarks: [
      { id: 'IBOV', return: '8', differencePercentagePoints: '4', status: 'AVAILABLE' },
      { id: 'CDI', return: '9', differencePercentagePoints: '3', status: 'AVAILABLE' },
    ],
    risk: {
      realizedVolatilityAnnualized: '18',
      maximumDrawdown: '-12',
      currentDrawdown: '-5',
      status: 'AVAILABLE',
    },
    riskAdjusted: { sharpe: '1.2', sortino: '1.5', riskFreeProxy: 'CDI', status: 'AVAILABLE' },
    relativeRisk: {
      benchmark: 'IBOV',
      beta: '0.9',
      correlation: '0.8',
      trackingErrorAnnualized: '10',
      status: 'AVAILABLE',
    },
    activePerformance: { alpha: '2', informationRatio: '1.1', treynor: '5', status: 'AVAILABLE' },
    tailRisk: {
      confidenceLevel: '95',
      downsideDeviationAnnualized: '12',
      semideviationAnnualized: '10',
      var95: '2.5',
      cvar95: '3.5',
      status: 'AVAILABLE',
    },
    scenario: {
      preset: 'EQUITY_DOWN_10',
      type: 'EQUITY_PRICE_SHOCK',
      baseValue: '100000',
      stressedValue: '90000',
      absoluteImpact: '-10000',
      percentageImpact: '-10',
      hypothetical: true,
      status: 'AVAILABLE',
    },
    dataQuality: {
      portfolioStateCompleteness: { status: 'AVAILABLE', reason: null },
      valuationCompleteness: { status: 'AVAILABLE', reason: null },
      performanceAvailability: { status: 'AVAILABLE', reason: null },
      benchmarkAvailability: { status: 'AVAILABLE', reason: null },
      riskAvailability: { status: 'AVAILABLE', reason: null },
      tailRiskAvailability: { status: 'AVAILABLE', reason: null },
      scenarioAvailability: { status: 'AVAILABLE', reason: null },
    },
    ...overrides,
  };
}

function summaryInput(currencies: CurrencyIntelligenceInput[]): PortfolioIntelligenceInput {
  return {
    portfolioId: 'portfolio-test-123',
    period: { startDate: '2025-09-22', endDate: '2026-09-22' },
    asOf: '2026-09-22',
    currencies,
  };
}

const sampleAssetData: AssetPositionCanonicalData = {
  assetId: 'asset-petr4',
  symbol: 'PETR4',
  name: 'Petróleo Brasileiro S.A.',
  assetType: 'EQUITY',
  currency: 'BRL',
  quantity: '100',
  averageCost: '30.123456',
  costBasis: '3012.3456',
  marketPrice: '35.50',
  marketValue: '3550.00',
  unrealizedGain: '537.6544',
  unrealizedGainPercentage: '17.8484',
  realizedGain: '120.00',
  totalIncome: '45.00',
  dividends: '30.00',
  jcp: '15.00',
  portfolioPercentage: '3.55',
  asOf: '2026-09-22',
};

describe('Asset-Scoped AI Grounding (Phase 3W, ADR-210–ADR-215)', () => {
  it('extracts canonical facts with exact decimal values and correct categories', () => {
    const facts = extractAssetFacts(sampleAssetData, '2026-09-22');
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.length).toBeLessThanOrEqual(25);

    const factMap = new Map(facts.map((f) => [f.factId, f]));

    // 1. Identity facts
    expect(factMap.get('ASSET:asset-petr4.IDENTITY.SYMBOL')).toMatchObject({
      category: 'ASSET_IDENTITY',
      value: 'PETR4',
      unit: 'TEXT_ENUM',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });
    expect(factMap.get('ASSET:asset-petr4.IDENTITY.NAME')).toMatchObject({
      category: 'ASSET_IDENTITY',
      value: 'Petróleo Brasileiro S.A.',
      unit: 'TEXT_ENUM',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });
    expect(factMap.get('ASSET:asset-petr4.IDENTITY.TYPE')).toMatchObject({
      category: 'ASSET_IDENTITY',
      value: 'EQUITY',
      unit: 'TEXT_ENUM',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });

    // 2. Position facts
    expect(factMap.get('ASSET:asset-petr4.POSITION.QUANTITY')).toMatchObject({
      category: 'ASSET_POSITION',
      value: '100',
      unit: 'QUANTITY',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });
    expect(factMap.get('ASSET:asset-petr4.POSITION.AVERAGE_COST')).toMatchObject({
      category: 'ASSET_POSITION',
      value: '30.123456',
      unit: 'MONEY',
      currency: 'BRL',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });
    expect(factMap.get('ASSET:asset-petr4.POSITION.COST_BASIS')).toMatchObject({
      category: 'ASSET_POSITION',
      value: '3012.3456',
      unit: 'MONEY',
      currency: 'BRL',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });
    expect(factMap.get('ASSET:asset-petr4.POSITION.MARKET_PRICE')).toMatchObject({
      category: 'ASSET_POSITION',
      value: '35.50',
      unit: 'MONEY',
      currency: 'BRL',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });
    expect(factMap.get('ASSET:asset-petr4.POSITION.MARKET_VALUE')).toMatchObject({
      category: 'ASSET_POSITION',
      value: '3550.00',
      unit: 'MONEY',
      currency: 'BRL',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });
    expect(factMap.get('ASSET:asset-petr4.POSITION.UNREALIZED_GAIN')).toMatchObject({
      category: 'ASSET_POSITION',
      value: '537.6544',
      unit: 'MONEY',
      currency: 'BRL',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });
    expect(factMap.get('ASSET:asset-petr4.POSITION.UNREALIZED_GAIN_PERCENTAGE')).toMatchObject({
      category: 'ASSET_POSITION',
      value: '17.8484',
      unit: 'PERCENTAGE',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });

    // 3. Realized and Income facts
    expect(factMap.get('ASSET:asset-petr4.REALIZED.REALIZED_GAIN')).toMatchObject({
      category: 'ASSET_REALIZED',
      value: '120.00',
      unit: 'MONEY',
      currency: 'BRL',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });
    expect(factMap.get('ASSET:asset-petr4.INCOME.TOTAL')).toMatchObject({
      category: 'ASSET_INCOME',
      value: '45.00',
      unit: 'MONEY',
      currency: 'BRL',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });
    expect(factMap.get('ASSET:asset-petr4.INCOME.DIVIDENDS')).toMatchObject({
      category: 'ASSET_INCOME',
      value: '30.00',
      unit: 'MONEY',
      currency: 'BRL',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });
    expect(factMap.get('ASSET:asset-petr4.INCOME.JCP')).toMatchObject({
      category: 'ASSET_INCOME',
      value: '15.00',
      unit: 'MONEY',
      currency: 'BRL',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });

    // 4. Allocation facts
    expect(factMap.get('ASSET:asset-petr4.ALLOCATION.PORTFOLIO_PERCENTAGE')).toMatchObject({
      category: 'ASSET_ALLOCATION',
      value: '3.55',
      unit: 'PERCENTAGE',
      status: 'AVAILABLE',
      assetId: 'asset-petr4',
    });
  });

  it('handles unknown cost basis gracefully with UNAVAILABLE status and reason', () => {
    const unknownCostData: AssetPositionCanonicalData = {
      ...sampleAssetData,
      averageCost: null,
      costBasis: null,
      unrealizedGain: null,
      unrealizedGainPercentage: null,
    };

    const facts = extractAssetFacts(unknownCostData, '2026-09-22');
    const factMap = new Map(facts.map((f) => [f.factId, f]));

    const avgCostFact = factMap.get('ASSET:asset-petr4.POSITION.AVERAGE_COST');
    expect(avgCostFact?.status).toBe('UNAVAILABLE');
    expect(avgCostFact?.value).toBeNull();
    expect(avgCostFact?.reason).toBe('UNKNOWN_COST_BASIS');

    const costBasisFact = factMap.get('ASSET:asset-petr4.POSITION.COST_BASIS');
    expect(costBasisFact?.status).toBe('UNAVAILABLE');
    expect(costBasisFact?.value).toBeNull();
    expect(costBasisFact?.reason).toBe('UNKNOWN_COST_BASIS');

    const unrealizedGainFact = factMap.get('ASSET:asset-petr4.POSITION.UNREALIZED_GAIN');
    expect(unrealizedGainFact?.status).toBe('UNAVAILABLE');
    expect(unrealizedGainFact?.value).toBeNull();
    expect(unrealizedGainFact?.reason).toBe('UNKNOWN_COST_BASIS');
  });

  it('handles price unavailable gracefully with UNAVAILABLE status and reason', () => {
    const priceUnavailableData: AssetPositionCanonicalData = {
      ...sampleAssetData,
      marketPrice: null,
      marketValue: null,
      unrealizedGain: null,
      unrealizedGainPercentage: null,
      portfolioPercentage: null,
    };

    const facts = extractAssetFacts(priceUnavailableData, '2026-09-22');
    const factMap = new Map(facts.map((f) => [f.factId, f]));

    const priceFact = factMap.get('ASSET:asset-petr4.POSITION.MARKET_PRICE');
    expect(priceFact?.status).toBe('UNAVAILABLE');
    expect(priceFact?.value).toBeNull();
    expect(priceFact?.reason).toBe('PRICE_UNAVAILABLE');

    const valFact = factMap.get('ASSET:asset-petr4.POSITION.MARKET_VALUE');
    expect(valFact?.status).toBe('UNAVAILABLE');
    expect(valFact?.value).toBeNull();
    expect(valFact?.reason).toBe('PRICE_UNAVAILABLE');

    const unrealizedFact = factMap.get('ASSET:asset-petr4.POSITION.UNREALIZED_GAIN');
    expect(unrealizedFact?.status).toBe('UNAVAILABLE');
    expect(unrealizedFact?.value).toBeNull();
    expect(unrealizedFact?.reason).toBe('PRICE_UNAVAILABLE');

    const pctFact = factMap.get('ASSET:asset-petr4.ALLOCATION.PORTFOLIO_PERCENTAGE');
    expect(pctFact?.status).toBe('UNAVAILABLE');
    expect(pctFact?.value).toBeNull();
    expect(pctFact?.reason).toBe('PRICE_UNAVAILABLE');
  });

  it('builds a deep-frozen, bounded PortfolioAssetAiGroundingContextV1', () => {
    const summary = buildPortfolioIntelligenceSummary(summaryInput([currencyInput()]));
    const context = buildPortfolioAssetAiGroundingContext(summary, sampleAssetData, {
      generatedAt: '2026-09-26T12:00:00.000Z',
    });

    expect(context.scope).toEqual({
      type: 'ASSET',
      assetId: 'asset-petr4',
      symbol: 'PETR4',
      name: 'Petróleo Brasileiro S.A.',
    });
    expect(context.assetFacts.length).toBeGreaterThan(0);
    expect(context.assetFacts.length).toBeLessThanOrEqual(25);
    expect(context.facts.length).toBeGreaterThan(context.assetFacts.length);

    // Context size budget
    const serialized = JSON.stringify(context);
    expect(serialized.length).toBeLessThan(32768);

    // Deep freeze
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.scope)).toBe(true);
    expect(Object.isFrozen(context.assetFacts)).toBe(true);
    expect(Object.isFrozen(context.facts)).toBe(true);
  });

  it('classifies asset explanation intent when asset scope is present', () => {
    const res = classifyConversationIntent('Qual é o meu preço médio nesta ação?', {
      type: 'ASSET',
      assetId: 'asset-petr4',
    });
    expect(res.intent).toBe('EXPLAIN_ASSET');
  });

  it('rejects unsupported asset queries (buy-more / prediction) upstream with 0 model calls', () => {
    const buyMoreRes = classifyConversationIntent('Devo comprar mais PETR4?', {
      type: 'ASSET',
      assetId: 'asset-petr4',
    });
    expect(buyMoreRes.intent).toBe('UNSUPPORTED_RECOMMENDATION');
    expect(buyMoreRes.reason).toBe('RECOMMENDATION_NOT_SUPPORTED');

    const predictRes = classifyConversationIntent('A ação vai subir no próximo mês?', {
      type: 'ASSET',
      assetId: 'asset-petr4',
    });
    expect(predictRes.intent).toBe('UNSUPPORTED_PREDICTION');
    expect(predictRes.reason).toBe('PREDICTION_NOT_SUPPORTED');
  });

  it('fails closed when query refers to an asset but scope is missing', () => {
    const res = classifyConversationIntent('Qual é meu preço médio em PETR4?');
    // Without explicit asset scope, asking about an asset position fails closed
    expect(res.intent).toBe('UNSUPPORTED_OTHER');
    expect(res.reason).toBe('MISSING_ASSET_SCOPE');
  });

  it('validates claims against asset facts and renders validated values accurately', () => {
    const summary = buildPortfolioIntelligenceSummary(summaryInput([currencyInput()]));
    const context = buildPortfolioAssetAiGroundingContext(summary, sampleAssetData);

    const claims: GroundedClaimInput[] = [
      {
        claimId: 'claim-pos-1',
        type: 'FACTUAL_METRIC',
        factIds: ['ASSET:asset-petr4.POSITION.AVERAGE_COST'],
        segments: [
          { type: 'TEXT', text: 'Seu preço médio em PETR4 é ' },
          { type: 'FACT_VALUE', factId: 'ASSET:asset-petr4.POSITION.AVERAGE_COST' },
          { type: 'TEXT', text: '.' },
        ],
      },
    ];

    const valResult = validateGroundedClaims(claims, context, { targetAssetId: 'asset-petr4' });
    expect(valResult.valid).toBe(true);
    expect(valResult.validatedClaims).toHaveLength(1);

    const rendered = renderValidatedClaims(valResult.validatedClaims);
    expect(rendered).toContain('BRL 30,12');
  });

  it('prohibits cross-asset evidence when targetAssetId is specified', () => {
    const summary = buildPortfolioIntelligenceSummary(summaryInput([currencyInput()]));
    const context = buildPortfolioAssetAiGroundingContext(summary, sampleAssetData);

    // Attempting to cite another asset fact
    const crossAssetClaims: GroundedClaimInput[] = [
      {
        claimId: 'claim-cross-1',
        type: 'FACTUAL_METRIC',
        factIds: ['ASSET:asset-vale3.POSITION.QUANTITY'],
        segments: [
          { type: 'TEXT', text: 'Você possui ' },
          { type: 'FACT_VALUE', factId: 'ASSET:asset-vale3.POSITION.QUANTITY' },
          { type: 'TEXT', text: ' ações.' },
        ],
      },
    ];

    const valResult = validateGroundedClaims(crossAssetClaims, context, {
      targetAssetId: 'asset-petr4',
    });
    expect(valResult.valid).toBe(false);
    expect(
      valResult.invalidReasons.some((r) => r.includes('CROSS_ASSET_EVIDENCE_PROHIBITED')),
    ).toBe(true);
  });
});
