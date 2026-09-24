export interface ActivePerformanceAlphaReadModel {
  /** Period Alpha in percent points (NOT annualized). Null when unavailable. */
  periodPercentage: string | null;
}

export interface ActivePerformanceInformationRatioReadModel {
  observationCount: number;
  /** Daily Information Ratio (unitless). Null when unavailable. */
  daily: string | null;
  /** Annualized Information Ratio (unitless). Null when unavailable. */
  annualized: string | null;
}

export interface ActivePerformanceTreynorReadModel {
  /** Period excess return per unit of Beta, in percent points. Null when unavailable. */
  periodPercentagePerBeta: string | null;
}

export interface ActivePerformanceCurrencyReadModel {
  currency: string;
  status: string;
  alpha: ActivePerformanceAlphaReadModel | null;
  informationRatio: ActivePerformanceInformationRatioReadModel | null;
  treynor: ActivePerformanceTreynorReadModel | null;
}

export interface PortfolioActivePerformanceReadModel {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  marketBenchmark: string;
  riskFreeProxy: string;
  currencies: Record<string, ActivePerformanceCurrencyReadModel>;
  status: string;
  dataAvailability: string;
}
