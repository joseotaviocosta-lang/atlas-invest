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
  knownCost: ValuationMoneyJSON;
  unrealizedGainLoss: ValuationMoneyJSON | null;
  unrealizedGainLossPercent: string | null;
  valuedPositionsCount: number;
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

export interface PortfolioValuationReadModel {
  portfolioId: string;
  asOf: string | null;
  engineVersion: string;
  valuationVersion: string;
  positions: PositionValuationReadModel[];
  accounts: AccountValuationReadModel[];
  totalsByCurrency: Record<string, CurrencyValuationTotalsReadModel>;
  completeness: ValuationCompleteness;
  summary: {
    totalPositions: number;
    valuedPositions: number;
    unavailablePositions: number;
    incompleteCostPositions: number;
    stalePositions: number;
    mismatchPositions: number;
    currencies: string[];
  };
  quoteSummary: {
    totalQuotesRequested: number;
    quotesAvailable: number;
    quotesUnavailable: number;
    quotesStale: number;
  };
}
