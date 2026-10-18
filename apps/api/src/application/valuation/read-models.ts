import { ValuationCompleteness, ValuationStatus } from '@atlas/valuation-engine';

export interface ValuationMoneyJSON {
  amount: string;
  currency: string;
}

export interface ValuationQuoteReadModel {
  assetId: string;
  price: string;
  currency: string;
  asOf: string;
  receivedAt: string;
  marketTime?: string;
  source: string;
  status: string;
  freshness: string;
  providerSymbol: string;
}

export interface PositionValuationReadModel {
  assetId: string;
  accountId: string | null;
  ticker: string | null;
  assetType: string | null;
  quantity: string;
  currency: string;
  totalCost: ValuationMoneyJSON | null;
  averageCost: ValuationMoneyJSON | null;
  costBasisStatus: 'KNOWN' | 'INCOMPLETE';
  quote: ValuationQuoteReadModel | null;
  marketValue: ValuationMoneyJSON | null;
  unrealizedGainLoss: ValuationMoneyJSON | null;
  unrealizedGainLossPercent: string | null;
  status: ValuationStatus;
  quoteFreshness: string | null;
  quoteStatus: string | null;
}

export interface CurrencyValuationTotalsReadModel {
  currency: string;
  marketValue: ValuationMoneyJSON;
  costBasis: ValuationMoneyJSON;
  knownCost: ValuationMoneyJSON;
  unrealizedGainLoss: ValuationMoneyJSON | null;
  unrealizedGainLossPercent: string | null;
  valuedPositionsCount: number;
  unvaluedPositionsCount: number;
  stalePositionsCount: number;
}

export interface AccountValuationReadModel {
  accountId: string;
  positions: PositionValuationReadModel[];
  totalsByCurrency: Record<string, CurrencyValuationTotalsReadModel>;
  valuedPositionsCount: number;
  unavailablePositionsCount: number;
  stalePositionsCount: number;
  incompleteCostPositionsCount: number;
  mismatchPositionsCount: number;
}

export interface TranslatedValuationRateInfoReadModel {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  rateDate: string;
  source: string;
  isInverted: boolean;
}

export interface TranslatedValuationSummaryReadModel {
  reportingCurrency: string;
  totalMarketValue: ValuationMoneyJSON;
  totalCostBasis: ValuationMoneyJSON;
  totalUnrealizedGainLoss: ValuationMoneyJSON | null;
  totalUnrealizedGainLossPercent: string | null;
  status: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
  ratesUsed: Record<string, TranslatedValuationRateInfoReadModel>;
  untranslatedCurrencies: string[];
}

export interface PortfolioValuationReadModel {
  portfolioId: string;
  asOf: string | null;
  engineVersion: string;
  valuationVersion: string;
  positions: PositionValuationReadModel[];
  accounts: AccountValuationReadModel[];
  totalsByCurrency: Record<string, CurrencyValuationTotalsReadModel>;
  translatedSummary?: TranslatedValuationSummaryReadModel;
  completeness: ValuationCompleteness;
  summary: {
    totalPositions: number;
    valuedPositions: number;
    unvaluedPositions: number;
    unavailablePositions: number;
    incompleteCostPositions: number;
    stalePositions: number;
    mismatchPositions: number;
    valuationCoveragePercent: string;
    currencies: string[];
  };
  quoteSummary: {
    totalQuotesRequested: number;
    quotesAvailable: number;
    quotesUnavailable: number;
    quotesStale: number;
  };
}

// ---------------------------------------------------------------------------
// Allocation Read Models
// ---------------------------------------------------------------------------

export interface AssetAllocationReadModel {
  assetId: string;
  ticker: string | null;
  assetType: string | null;
  currency: string;
  marketValue: ValuationMoneyJSON;
  allocationPercent: string;
  quoteFreshness: string | null;
}

export interface AssetClassAllocationReadModel {
  assetClass: string;
  currency: string;
  marketValue: ValuationMoneyJSON;
  allocationPercent: string;
  assetCount: number;
}

export interface CurrencyAllocationBucketReadModel {
  currency: string;
  totalMarketValue: ValuationMoneyJSON;
  byAsset: AssetAllocationReadModel[];
  byAssetClass: AssetClassAllocationReadModel[];
  unvaluedAssets: Array<{
    assetId: string;
    ticker: string | null;
    assetType: string | null;
    currency: string;
    reason: string;
  }>;
}

export interface TranslatedAllocationItemReadModel {
  assetId: string;
  ticker?: string;
  assetType?: string;
  nativeCurrency: string;
  nativeMarketValue: ValuationMoneyJSON;
  reportingCurrency: string;
  reportingMarketValue: ValuationMoneyJSON;
  allocationPercent: string;
  quoteFreshness: string | null;
}

export interface TranslatedAssetClassAllocationItemReadModel {
  assetClass: string;
  reportingCurrency: string;
  reportingMarketValue: ValuationMoneyJSON;
  allocationPercent: string;
  assetCount: number;
}

export interface TranslatedPortfolioAllocationReadModel {
  reportingCurrency: string;
  status: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
  totalMarketValue: ValuationMoneyJSON;
  byAsset: TranslatedAllocationItemReadModel[];
  byAssetClass: TranslatedAssetClassAllocationItemReadModel[];
  untranslatedCurrencies: string[];
}

export interface PortfolioAllocationReadModel {
  portfolioId: string;
  asOf: string | null;
  status: 'COMPLETE' | 'PARTIAL' | 'EMPTY';
  valuationCoveragePercent: string;
  currencies: Record<string, CurrencyAllocationBucketReadModel>;
  translatedAllocation?: TranslatedPortfolioAllocationReadModel;
}
