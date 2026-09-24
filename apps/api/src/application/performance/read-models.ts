export interface PerformancePeriodReadModel {
  startDate: string;
  endDate: string;
}

export interface PerformanceCurrencyReadModel {
  currency: string;
  twr: string | null;
  xirr: string | null;
  twrStatus: string;
  xirrStatus: string;
  status: string;
  dataAvailability: string;
  benchmark?: {
    id: string;
    name: string;
    currency: string;
    type: string;
    return: string | null;
    status: string;
    dataAvailability: string;
    observationCount?: number;
    startLevel?: string;
    endLevel?: string;
    startDate?: string;
    endDate?: string;
  } | null;
  differencePercentagePoints?: string | null;
}

export interface PortfolioPerformanceReadModel {
  portfolioId: string;
  period: PerformancePeriodReadModel;
  inceptionDate: string | null;
  currencies: Record<string, PerformanceCurrencyReadModel>;
  status: string;
  dataAvailability: string;
}
