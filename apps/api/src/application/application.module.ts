import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database';
import { HistoricalMarketDataModule } from '../market-data/market-data.module';
import {
  CreatePortfolioUseCase,
  GetPortfolioUseCase,
  ListPortfoliosUseCase,
  GetPortfolioStateUseCase,
  GetPortfolioPositionsUseCase,
  GetPortfolioHistoryUseCase,
} from './portfolios';
import { GetPortfolioValuationUseCase } from './valuation';
import { GetPortfolioPerformanceUseCase } from './performance';
import { GetPortfolioPerformanceSeriesUseCase } from './performance/get-portfolio-performance-series.use-case';
import { GetPortfolioRiskMetricsUseCase } from './performance/get-portfolio-risk-metrics.use-case';
import { GetPortfolioRiskAdjustedMetricsUseCase } from './performance/get-portfolio-risk-adjusted-metrics.use-case';
import { GetPortfolioBenchmarkRelativeRiskUseCase } from './performance/get-portfolio-benchmark-relative-risk.use-case';
import { GetPortfolioActivePerformanceUseCase } from './performance/get-portfolio-active-performance.use-case';
import { GetPortfolioRollingAnalyticsUseCase } from './performance/get-portfolio-rolling-analytics.use-case';
import { GetPortfolioTailRiskMetricsUseCase } from './performance/get-portfolio-tail-risk-metrics.use-case';
import { RunPortfolioScenarioUseCase } from './performance/run-portfolio-scenario.use-case';
import { GetPortfolioIntelligenceSummaryUseCase } from './performance/get-portfolio-intelligence-summary.use-case';
import { GetMonthlyTaxStateUseCase } from './fiscal/get-monthly-tax-state.use-case';
import { GetPortfolioAiGroundingContextUseCase } from './ai/get-portfolio-ai-grounding-context.use-case';
import { GetPortfolioAssetAiGroundingContextUseCase } from './ai/get-portfolio-asset-ai-grounding-context.use-case';
import { GetPortfolioTimelineAiGroundingContextUseCase } from './ai/get-portfolio-timeline-ai-grounding-context.use-case';
import {
  CreateInstitutionUseCase,
  GetInstitutionUseCase,
  ListInstitutionsUseCase,
} from './institutions';
import { CreateAccountUseCase, GetAccountUseCase, ListAccountsUseCase } from './accounts';
import { CreateAssetUseCase, GetAssetUseCase, SearchAssetsUseCase } from './assets';
import {
  CreateTransactionUseCase,
  GetTransactionUseCase,
  ListTransactionsUseCase,
} from './transactions';

const USE_CASES = [
  CreatePortfolioUseCase,
  GetPortfolioUseCase,
  ListPortfoliosUseCase,
  GetPortfolioStateUseCase,
  GetPortfolioPositionsUseCase,
  GetPortfolioHistoryUseCase,
  GetPortfolioValuationUseCase,
  GetPortfolioPerformanceUseCase,
  GetPortfolioPerformanceSeriesUseCase,
  GetPortfolioRiskMetricsUseCase,
  GetPortfolioRiskAdjustedMetricsUseCase,
  GetPortfolioBenchmarkRelativeRiskUseCase,
  GetPortfolioActivePerformanceUseCase,
  GetPortfolioRollingAnalyticsUseCase,
  GetPortfolioTailRiskMetricsUseCase,
  RunPortfolioScenarioUseCase,
  GetPortfolioIntelligenceSummaryUseCase,
  GetMonthlyTaxStateUseCase,
  GetPortfolioAiGroundingContextUseCase,
  GetPortfolioAssetAiGroundingContextUseCase,
  GetPortfolioTimelineAiGroundingContextUseCase,
  CreateInstitutionUseCase,
  GetInstitutionUseCase,
  ListInstitutionsUseCase,
  CreateAccountUseCase,
  GetAccountUseCase,
  ListAccountsUseCase,
  CreateAssetUseCase,
  GetAssetUseCase,
  SearchAssetsUseCase,
  CreateTransactionUseCase,
  GetTransactionUseCase,
  ListTransactionsUseCase,
];

@Module({
  imports: [DatabaseModule, HistoricalMarketDataModule],
  providers: [...USE_CASES],
  exports: [...USE_CASES],
})
export class ApplicationModule {}
