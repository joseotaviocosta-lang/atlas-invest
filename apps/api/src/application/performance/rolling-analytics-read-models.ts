export interface RollingVolatilityPointReadModel {
  windowStartDate: string;
  endDate: string;
  observationCount: number;
  annualizedPercentage: string | null;
  status: string;
}

export interface RollingVolatilitySeriesReadModel {
  window: number;
  frequency: string;
  status: string;
  points: RollingVolatilityPointReadModel[];
}

export interface RollingSharpePointReadModel {
  windowStartDate: string;
  endDate: string;
  observationCount: number;
  annualized: string | null;
  status: string;
}

export interface RollingSharpeSeriesReadModel {
  window: number;
  frequency: string;
  status: string;
  points: RollingSharpePointReadModel[];
}

export interface RollingBetaPointReadModel {
  windowStartDate: string;
  endDate: string;
  observationCount: number;
  beta: string | null;
  status: string;
}

export interface RollingBetaSeriesReadModel {
  window: number;
  status: string;
  points: RollingBetaPointReadModel[];
}

export interface RollingCurrencyReadModel {
  currency: string;
  rollingVolatility: RollingVolatilitySeriesReadModel;
  rollingSharpe: RollingSharpeSeriesReadModel;
  rollingBeta: RollingBetaSeriesReadModel;
}

export interface PortfolioRollingAnalyticsReadModel {
  portfolioId: string;
  period: { startDate: string; endDate: string };
  window: number;
  currencies: Record<string, RollingCurrencyReadModel>;
  status: string;
  dataAvailability: string;
}
