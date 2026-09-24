export interface PerformanceSeriesPointReadModel {
  date: string;
  portfolioReturn: string | null;
  benchmarkReturn: string | null;
  status: string;
}

export interface PerformanceSeriesCurrencyReadModel {
  currency: string;
  granularity: string;
  status: string;
  dataAvailability: string;
  benchmark: {
    id: string;
    name: string;
    currency: string;
    type: string;
    status: string;
    dataAvailability: string;
  } | null;
  points: PerformanceSeriesPointReadModel[];
}

export interface PortfolioPerformanceSeriesReadModel {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  requestedGranularity: string;
  currencies: Record<string, PerformanceSeriesCurrencyReadModel>;
  status: string;
  dataAvailability: string;
}
