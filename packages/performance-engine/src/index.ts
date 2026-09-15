import { PortfolioId, LocalDate, Percentage } from '@atlas/domain';

export const PERFORMANCE_ENGINE_VERSION = '0.1.0';

export interface PerformanceTimeframe {
  startDate: LocalDate;
  endDate: LocalDate;
}

export interface BenchmarkComparison {
  benchmark: string;
  portfolioReturn: Percentage;
  benchmarkReturn: Percentage;
  alpha: Percentage;
}

/**
 * Future Performance Engine contract.
 * Pure interface contract - zero calculation logic in Phase 0B.
 */
export interface PerformanceEngineContract {
  calculateTWR(portfolioId: PortfolioId, timeframe: PerformanceTimeframe): Percentage;
  calculateXIRR(portfolioId: PortfolioId, timeframe: PerformanceTimeframe): Percentage;
  calculateReturn(portfolioId: PortfolioId, timeframe: PerformanceTimeframe): Percentage;
  compareBenchmark(
    portfolioId: PortfolioId,
    benchmark: string,
    timeframe: PerformanceTimeframe,
  ): BenchmarkComparison;
  calculateContribution(
    portfolioId: PortfolioId,
    timeframe: PerformanceTimeframe,
  ): Record<string, Percentage>;
}
