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
import {
  GetPortfolioValuationUseCase,
  GetPortfolioAllocationUseCase,
  UpdatePortfolioMarketDataUseCase,
} from './valuation';
import { UpdateBenchmarkDataUseCase, GetBenchmarkCoverageUseCase } from './benchmark';
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
import { GetMonthlyTaxLiabilityUseCase } from './fiscal/get-monthly-tax-liability.use-case';
import {
  GetTaxCompensationElectionUseCase,
  PutTaxCompensationElectionUseCase,
} from './fiscal/tax-compensation-election.use-case';
import { GetTaxInputReadinessUseCase } from './fiscal/get-tax-input-readiness.use-case';
import { PersistedTaxInputProvider } from './fiscal/persisted-tax-input-provider';
import {
  RecordFiiTaxEligibilityFactsUseCase,
  RecordTradeClassificationUseCase,
  RecordWithholdingInputUseCase,
} from './fiscal/record-tax-inputs.use-case';
import { ListTaxInputsUseCase } from './fiscal/list-tax-inputs.use-case';
import { ResolveTaxInputConflictUseCase } from './fiscal/resolve-tax-input-conflict.use-case';
import { MaterializeTaxObligationUseCase } from './fiscal/materialize-tax-obligation.use-case';
import {
  GetTaxObligationUseCase,
  ListTaxObligationsUseCase,
} from './fiscal/tax-obligation-query.use-case';
import { RecordTaxPaymentUseCase } from './fiscal/record-tax-payment.use-case';
import { GetTaxPaymentAdjustmentUseCase } from './fiscal/get-tax-payment-adjustment.use-case';
import { GetTaxPaymentSummaryUseCase } from './fiscal/get-tax-payment-summary.use-case';
import { SettleTaxPaymentAggregationUseCase } from './fiscal/settle-tax-payment-aggregation.use-case';
import { GetDarfReadinessUseCase } from './fiscal/get-darf-readiness.use-case';
import { CreateDarfHandoffUseCase } from './fiscal/create-darf-handoff.use-case';
import {
  GetDarfGenerationUseCase,
  ListDarfGenerationsUseCase,
} from './fiscal/darf-generation-query.use-case';
import {
  GetTaxpayerIdentityUseCase,
  RecordTaxpayerIdentityUseCase,
} from './fiscal/taxpayer-identity.use-case';
import { GetAnnualPositionReportUseCase } from './fiscal/get-annual-position-report.use-case';
import { GetAnnualCapitalMarketSummaryUseCase } from './fiscal/get-annual-capital-market-summary.use-case';
import { GetAnnualInvestmentIncomeSummaryUseCase } from './fiscal/get-annual-investment-income-summary.use-case';
import { RecordAnnualOpeningPositionUseCase } from './fiscal/record-annual-opening-position.use-case';
import { ListAnnualOpeningPositionsUseCase } from './fiscal/list-annual-opening-positions.use-case';
import { ConfirmAnnualOpeningPositionUseCase } from './fiscal/confirm-annual-opening-position.use-case';
import { GetAnnualTaxReadinessUseCase } from './fiscal/get-annual-tax-readiness.use-case';
import { RecordTaxpayerConfirmationUseCase } from './fiscal/record-taxpayer-confirmation.use-case';
import { GetAnnualTaxReportingPackageUseCase } from './fiscal/get-annual-tax-reporting-package.use-case';
import { GetAnnualHighIncomeAssessmentUseCase } from './fiscal/get-annual-high-income-assessment.use-case';
import { RecordHighIncomeEvidenceUseCase } from './fiscal/record-high-income-evidence.use-case';
import { ResolveHighIncomeEvidenceUseCase } from './fiscal/resolve-high-income-evidence.use-case';
import { HighIncomeAnnualReviewPackageService } from './fiscal/get-high-income-annual-review-package.use-case';
import { UnifiedAnnualIrpfService } from './fiscal/get-unified-annual-irpf.use-case';
import { UnifiedAnnualReviewPackageService } from './fiscal/get-unified-annual-review-package.use-case';
import { GetTaxComplianceTimelineUseCase } from './fiscal/get-tax-compliance-timeline.use-case';
import { RecordTaxComplianceActionUseCase } from './fiscal/record-tax-compliance-action.use-case';
import { GetTaxPaymentSupportUseCase } from './fiscal/get-tax-payment-support.use-case';
import { RecordTaxPaymentEvidenceUseCase } from './fiscal/record-tax-payment-evidence.use-case';
import { ListTaxPaymentEvidenceUseCase } from './fiscal/list-tax-payment-evidence.use-case';
import { GetTaxComplianceRemindersUseCase } from './fiscal/get-tax-compliance-reminders.use-case';
import { RecordTaxReminderActionUseCase } from './fiscal/record-tax-reminder-action.use-case';
import { TaxReminderPreferencesUseCase } from './fiscal/tax-reminder-preferences.use-case';
import { RecordTaxNotificationDeliveryUseCase } from './fiscal/record-tax-notification-delivery.use-case';
import { GetTaxComplianceActionCenterUseCase } from './fiscal/get-tax-compliance-action-center.use-case';
import { GetTaxComplianceCalendarUseCase } from './fiscal/get-tax-compliance-calendar.use-case';
import { GetPeriodCloseReadinessUseCase } from './fiscal/get-period-close-readiness.use-case';
import { CloseCompliancePeriodUseCase } from './fiscal/close-compliance-period.use-case';
import { ReopenCompliancePeriodUseCase } from './fiscal/reopen-compliance-period.use-case';
import { ExportPeriodCloseBinderUseCase } from './fiscal/export-period-close-binder.use-case';
import { ListPeriodCloseHistoryUseCase } from './fiscal/list-period-close-history.use-case';
import { SystemFiscalClock } from './fiscal/fiscal-clock';
import { EMPTY_TAX_INPUT_ADAPTER_REGISTRY } from './fiscal/tax-input-source-adapter';
import {
  FISCAL_CLOCK,
  TAX_INPUT_ADAPTER_REGISTRY,
  TAX_INPUT_PROVIDER,
  TAX_RULE_REGISTRY,
} from './fiscal/tokens';
import { PRODUCTION_TAX_RULE_REGISTRY } from './fiscal/fiscal-rule-registry';
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
  RectifyPortfolioTransactionUseCase,
} from './transactions';
import {
  ConfirmPortfolioImportUseCase,
  PreviewPortfolioImportUseCase,
  IntegrationRunService,
  IntegrationScheduleService,
  IntegrationSchedulerService,
  IntegrationWorkerService,
  SimulatedB3SyncExecutor,
  SourceSyncExecutorRegistry,
  defaultSchedulingPolicy,
} from './imports';
import { INTEGRATION_SCHEDULING_POLICY } from './imports/integration-scheduling.tokens';

const USE_CASES = [
  CreatePortfolioUseCase,
  GetPortfolioUseCase,
  ListPortfoliosUseCase,
  GetPortfolioStateUseCase,
  GetPortfolioPositionsUseCase,
  GetPortfolioHistoryUseCase,
  GetPortfolioValuationUseCase,
  GetPortfolioAllocationUseCase,
  UpdatePortfolioMarketDataUseCase,
  UpdateBenchmarkDataUseCase,
  GetBenchmarkCoverageUseCase,
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
  GetMonthlyTaxLiabilityUseCase,
  GetTaxCompensationElectionUseCase,
  PutTaxCompensationElectionUseCase,
  GetTaxInputReadinessUseCase,
  RecordTradeClassificationUseCase,
  RecordWithholdingInputUseCase,
  RecordFiiTaxEligibilityFactsUseCase,
  ListTaxInputsUseCase,
  ResolveTaxInputConflictUseCase,
  MaterializeTaxObligationUseCase,
  GetTaxObligationUseCase,
  ListTaxObligationsUseCase,
  RecordTaxPaymentUseCase,
  GetTaxPaymentAdjustmentUseCase,
  GetTaxPaymentSummaryUseCase,
  SettleTaxPaymentAggregationUseCase,
  GetDarfReadinessUseCase,
  CreateDarfHandoffUseCase,
  GetDarfGenerationUseCase,
  ListDarfGenerationsUseCase,
  GetTaxpayerIdentityUseCase,
  RecordTaxpayerIdentityUseCase,
  GetAnnualPositionReportUseCase,
  GetAnnualCapitalMarketSummaryUseCase,
  GetAnnualInvestmentIncomeSummaryUseCase,
  RecordAnnualOpeningPositionUseCase,
  ListAnnualOpeningPositionsUseCase,
  ConfirmAnnualOpeningPositionUseCase,
  GetAnnualTaxReadinessUseCase,
  RecordTaxpayerConfirmationUseCase,
  GetAnnualTaxReportingPackageUseCase,
  GetAnnualHighIncomeAssessmentUseCase,
  RecordHighIncomeEvidenceUseCase,
  ResolveHighIncomeEvidenceUseCase,
  HighIncomeAnnualReviewPackageService,
  UnifiedAnnualIrpfService,
  UnifiedAnnualReviewPackageService,
  GetTaxComplianceTimelineUseCase,
  RecordTaxComplianceActionUseCase,
  GetTaxPaymentSupportUseCase,
  RecordTaxPaymentEvidenceUseCase,
  ListTaxPaymentEvidenceUseCase,
  GetTaxComplianceRemindersUseCase,
  RecordTaxReminderActionUseCase,
  TaxReminderPreferencesUseCase,
  RecordTaxNotificationDeliveryUseCase,
  GetTaxComplianceActionCenterUseCase,
  GetTaxComplianceCalendarUseCase,
  GetPeriodCloseReadinessUseCase,
  CloseCompliancePeriodUseCase,
  ReopenCompliancePeriodUseCase,
  ExportPeriodCloseBinderUseCase,
  ListPeriodCloseHistoryUseCase,
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
  RectifyPortfolioTransactionUseCase,
  PreviewPortfolioImportUseCase,
  ConfirmPortfolioImportUseCase,
  IntegrationRunService,
  IntegrationScheduleService,
  IntegrationSchedulerService,
  IntegrationWorkerService,
  SimulatedB3SyncExecutor,
];

@Module({
  imports: [DatabaseModule, HistoricalMarketDataModule],
  providers: [
    ...USE_CASES,
    { provide: TAX_RULE_REGISTRY, useValue: PRODUCTION_TAX_RULE_REGISTRY },
    { provide: TAX_INPUT_PROVIDER, useClass: PersistedTaxInputProvider },
    { provide: TAX_INPUT_ADAPTER_REGISTRY, useValue: EMPTY_TAX_INPUT_ADAPTER_REGISTRY },
    { provide: FISCAL_CLOCK, useClass: SystemFiscalClock },
    { provide: INTEGRATION_SCHEDULING_POLICY, useValue: defaultSchedulingPolicy() },
    {
      provide: SourceSyncExecutorRegistry,
      useFactory: (simulated: SimulatedB3SyncExecutor) => {
        const registry = new SourceSyncExecutorRegistry();
        registry.register(simulated);
        return registry;
      },
      inject: [SimulatedB3SyncExecutor],
    },
  ],
  exports: [
    ...USE_CASES,
    SourceSyncExecutorRegistry,
    TAX_RULE_REGISTRY,
    TAX_INPUT_PROVIDER,
    TAX_INPUT_ADAPTER_REGISTRY,
    FISCAL_CLOCK,
  ],
})
export class ApplicationModule {}
