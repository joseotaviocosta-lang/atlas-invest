export interface RiskVolatilityReadModel {
  frequency: string;
  observationCount: number;
  samplePercentage: string | null;
  annualizedPercentage: string | null;
  annualizationFactor: string;
  status: string;
}

export interface RiskDrawdownReadModel {
  maximumPercentage: string | null;
  peakDate: string | null;
  troughDate: string | null;
  recoveryDate: string | null;
  currentPercentage: string | null;
  status: string;
}

export interface RiskCurrencyReadModel {
  currency: string;
  frequency: string;
  status: string;
  dataAvailability: string;
  volatility: RiskVolatilityReadModel;
  drawdown: RiskDrawdownReadModel;
}

export interface PortfolioRiskReadModel {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  currencies: Record<string, RiskCurrencyReadModel>;
  status: string;
  dataAvailability: string;
}
