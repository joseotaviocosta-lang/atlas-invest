export interface RiskAdjustedSharpeReadModel {
  observationCount: number;
  meanDailyExcessPercentage: string | null;
  daily: string | null;
  annualized: string | null;
  annualizationFactor: string;
  status: string;
}

export interface RiskAdjustedSortinoReadModel {
  observationCount: number;
  downsideObservationCount: number;
  downsideDeviationPercentage: string | null;
  daily: string | null;
  annualized: string | null;
  annualizationFactor: string;
  status: string;
}

export interface RiskAdjustedCurrencyReadModel {
  currency: string;
  frequency: string;
  status: string;
  dataAvailability: string;
  riskFreeProxy: string | null;
  sharpe: RiskAdjustedSharpeReadModel | null;
  sortino: RiskAdjustedSortinoReadModel | null;
}

export interface PortfolioRiskAdjustedReadModel {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  currencies: Record<string, RiskAdjustedCurrencyReadModel>;
  status: string;
  dataAvailability: string;
}
