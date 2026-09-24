export interface DownsideDeviationReadModel {
  frequency: string;
  dailyPercentage: string | null;
  annualizedPercentage: string | null;
  negativeObservationCount: number;
}

export interface SemideviationReadModel {
  frequency: string;
  dailyPercentage: string | null;
  annualizedPercentage: string | null;
}

export interface HistoricalVarReadModel {
  confidenceLevel: string;
  quantileReturnPercentage: string | null;
  lossPercentage: string | null;
  tailObservationCount: number;
}

export interface HistoricalCvarReadModel {
  confidenceLevel: string;
  meanTailReturnPercentage: string | null;
  lossPercentage: string | null;
  tailObservationCount: number;
}

export interface TailRiskCurrencyReadModel {
  currency: string;
  status: string;
  observationCount: number;
  downsideDeviation: DownsideDeviationReadModel;
  semideviation: SemideviationReadModel;
  historicalVar: HistoricalVarReadModel;
  historicalCvar: HistoricalCvarReadModel;
}

export interface PortfolioTailRiskReadModel {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  confidenceLevel: string;
  currencies: Record<string, TailRiskCurrencyReadModel>;
  status: string;
  dataAvailability: string;
}
