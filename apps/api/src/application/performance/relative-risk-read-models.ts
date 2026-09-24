export interface RelativeRiskAlignmentReadModel {
  portfolioIntervalCount: number;
  benchmarkIntervalCount: number;
  pairedObservationCount: number;
  droppedPortfolioIntervalCount: number;
  droppedBenchmarkIntervalCount: number;
}

export interface TrackingErrorReadModel {
  frequency: string;
  observationCount: number;
  samplePercentage: string | null;
  annualizedPercentage: string | null;
  annualizationFactor: string;
  status: string;
}

export interface RelativeRiskCurrencyReadModel {
  currency: string;
  status: string;
  alignment: RelativeRiskAlignmentReadModel | null;
  beta: string | null;
  correlation: string | null;
  trackingError: TrackingErrorReadModel | null;
}

export interface RelativeRiskBenchmarkReadModel {
  id: string;
  name: string;
  currency: string;
}

export interface PortfolioBenchmarkRelativeRiskReadModel {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  benchmark: RelativeRiskBenchmarkReadModel;
  currencies: Record<string, RelativeRiskCurrencyReadModel>;
  status: string;
  dataAvailability: string;
}
