import {
  buildPortfolioIntelligenceSummary,
  type CurrencyIntelligenceInput,
  type PortfolioIntelligenceInput,
} from '@atlas/portfolio-intelligence';
import {
  buildPortfolioAiGroundingContext,
  buildPortfolioAssetAiGroundingContext,
  buildPortfolioTimelineAiGroundingContext,
  type AssetPositionCanonicalData,
  type PortfolioAiEventV1,
} from '@atlas/ai-engine';

export const PORTFOLIO_ID = 'portfolio-123';
export const PERIOD = { from: '2026-01-01', to: '2026-12-31' } as const;

export function currencyInput(
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

export function summaryInput(currencies: CurrencyIntelligenceInput[]): PortfolioIntelligenceInput {
  return {
    portfolioId: PORTFOLIO_ID,
    period: { startDate: '2025-12-31', endDate: '2026-12-31' },
    asOf: '2026-12-31',
    currencies,
  };
}

export function portfolioContext(currencies: CurrencyIntelligenceInput[] = [currencyInput()]) {
  return buildPortfolioAiGroundingContext(
    buildPortfolioIntelligenceSummary(summaryInput(currencies)),
  );
}

export const PETR4: AssetPositionCanonicalData = {
  assetId: 'asset-petr4',
  symbol: 'PETR4',
  name: 'Petróleo Brasileiro S.A.',
  assetType: 'STOCK',
  currency: 'BRL',
  quantity: '100',
  averageCost: '35.50',
  costBasis: '3550.00',
  marketPrice: '37.52',
  marketValue: '3752.00',
  unrealizedGain: '202.00',
  unrealizedGainPercentage: '5.69',
  realizedGain: '150.00',
  totalIncome: '80.00',
  dividends: '50.00',
  jcp: '30.00',
  portfolioPercentage: '3.75',
};

export function assetContext(asset: AssetPositionCanonicalData = PETR4) {
  return buildPortfolioAssetAiGroundingContext(
    buildPortfolioIntelligenceSummary(summaryInput([currencyInput()])),
    asset,
  );
}

export function makeEvents(
  count: number,
  overrides: Partial<PortfolioAiEventV1> = {},
): PortfolioAiEventV1[] {
  return Array.from({ length: count }, (_, i) => ({
    eventId: `evt-${String(i).padStart(6, '0')}`,
    eventType: (i % 2 === 0 ? 'BUY' : 'SELL') as PortfolioAiEventV1['eventType'],
    economicDate: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    assetId: `asset-${i % 5}`,
    symbol: `TCK${i % 5}`,
    assetName: `Companhia ${i % 5} S.A.`,
    quantity: '100',
    moneyAmount: '3752.48',
    currency: 'BRL',
    nature: 'HISTORICAL' as const,
    ...overrides,
  }));
}

export function timelineContext(candidateCount: number, events?: PortfolioAiEventV1[]) {
  return buildPortfolioTimelineAiGroundingContext({
    portfolioId: PORTFOLIO_ID,
    period: PERIOD,
    scope: { type: 'TIMELINE', from: PERIOD.from, to: PERIOD.to },
    candidateEvents: events ?? makeEvents(candidateCount),
  });
}

export function assetTimelineContext(assetId: string, candidateCount: number) {
  return buildPortfolioTimelineAiGroundingContext({
    portfolioId: PORTFOLIO_ID,
    period: PERIOD,
    scope: { type: 'ASSET_TIMELINE', assetId, from: PERIOD.from, to: PERIOD.to },
    candidateEvents: makeEvents(candidateCount),
  });
}

export const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');
