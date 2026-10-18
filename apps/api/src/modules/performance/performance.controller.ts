import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GetPortfolioPerformanceUseCase } from '../../application/performance';
import { GetPortfolioPerformanceSeriesUseCase } from '../../application/performance/get-portfolio-performance-series.use-case';
import { GetPortfolioRiskMetricsUseCase } from '../../application/performance/get-portfolio-risk-metrics.use-case';
import { GetPortfolioRiskAdjustedMetricsUseCase } from '../../application/performance/get-portfolio-risk-adjusted-metrics.use-case';
import { GetPortfolioBenchmarkRelativeRiskUseCase } from '../../application/performance/get-portfolio-benchmark-relative-risk.use-case';
import { GetPortfolioActivePerformanceUseCase } from '../../application/performance/get-portfolio-active-performance.use-case';
import { GetPortfolioRollingAnalyticsUseCase } from '../../application/performance/get-portfolio-rolling-analytics.use-case';
import { GetPortfolioTailRiskMetricsUseCase } from '../../application/performance/get-portfolio-tail-risk-metrics.use-case';
import { RunPortfolioScenarioUseCase } from '../../application/performance/run-portfolio-scenario.use-case';
import { GetPortfolioIntelligenceSummaryUseCase } from '../../application/performance/get-portfolio-intelligence-summary.use-case';
import { ScenarioDefinition } from '@atlas/scenario-engine';
import { RunScenarioBody, RunScenarioBodySchema } from './dto/run-scenario.dto';
import { UUIDParamPipe, ZodValidationPipe } from '../../common/pipes';
import { CurrentPrincipal, AuthenticatedPrincipal } from '../../auth';

@ApiTags('Portfolios')
@ApiBearerAuth()
@Controller('api/v1/portfolios')
export class PerformanceController {
  constructor(
    @Inject(GetPortfolioPerformanceUseCase)
    private readonly getPortfolioPerformanceUseCase: GetPortfolioPerformanceUseCase,
    @Inject(GetPortfolioPerformanceSeriesUseCase)
    private readonly getPortfolioPerformanceSeriesUseCase: GetPortfolioPerformanceSeriesUseCase,
    @Inject(GetPortfolioRiskMetricsUseCase)
    private readonly getPortfolioRiskMetricsUseCase: GetPortfolioRiskMetricsUseCase,
    @Inject(GetPortfolioRiskAdjustedMetricsUseCase)
    private readonly getPortfolioRiskAdjustedMetricsUseCase: GetPortfolioRiskAdjustedMetricsUseCase,
    @Inject(GetPortfolioBenchmarkRelativeRiskUseCase)
    private readonly getPortfolioBenchmarkRelativeRiskUseCase: GetPortfolioBenchmarkRelativeRiskUseCase,
    @Inject(GetPortfolioActivePerformanceUseCase)
    private readonly getPortfolioActivePerformanceUseCase: GetPortfolioActivePerformanceUseCase,
    @Inject(GetPortfolioRollingAnalyticsUseCase)
    private readonly getPortfolioRollingAnalyticsUseCase: GetPortfolioRollingAnalyticsUseCase,
    @Inject(GetPortfolioTailRiskMetricsUseCase)
    private readonly getPortfolioTailRiskMetricsUseCase: GetPortfolioTailRiskMetricsUseCase,
    @Inject(RunPortfolioScenarioUseCase)
    private readonly runPortfolioScenarioUseCase: RunPortfolioScenarioUseCase,
    @Inject(GetPortfolioIntelligenceSummaryUseCase)
    private readonly getPortfolioIntelligenceSummaryUseCase: GetPortfolioIntelligenceSummaryUseCase,
  ) {}

  @Get(':portfolioId/performance')
  @ApiOperation({
    summary:
      'Get portfolio performance (TWR/XIRR) — foundation, may return UNAVAILABLE when no historical valuations',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Portfolio performance (may be UNAVAILABLE)' })
  @ApiResponse({ status: 400, description: 'Invalid period' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPerformance(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('benchmark') benchmark: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioPerformanceUseCase.execute({
      portfolioId,
      userId: principal.userId,
      startDate,
      endDate,
      benchmark,
    });
    return { data };
  }

  @Get(':portfolioId/performance/series')
  @ApiOperation({
    summary:
      'Get cumulative performance series (TWR, normalized to 0% at start) with optional IBOV/CDI benchmark alignment',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Portfolio performance series' })
  @ApiResponse({ status: 400, description: 'Invalid period, granularity or benchmark' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPerformanceSeries(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('benchmark') benchmark: string | undefined,
    @Query('granularity') granularity: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioPerformanceSeriesUseCase.execute({
      portfolioId,
      userId: principal.userId,
      startDate,
      endDate,
      benchmark,
      granularity,
    });
    return { data };
  }

  @Get(':portfolioId/performance/risk')
  @ApiOperation({
    summary:
      'Get historical risk metrics (realized volatility, drawdown) — DAILY TWR methodology, never chart display samples',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Portfolio risk metrics (may be UNAVAILABLE)' })
  @ApiResponse({ status: 400, description: 'Invalid period' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPerformanceRisk(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioRiskMetricsUseCase.execute({
      portfolioId,
      userId: principal.userId,
      startDate,
      endDate,
    });
    return { data };
  }

  @Get(':portfolioId/performance/risk-adjusted')
  @ApiOperation({
    summary:
      'Get risk-adjusted metrics (Sharpe, Sortino) — aligned TWR/CDI economic observations, CDI as BRL proxy',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Risk-adjusted metrics (may be UNAVAILABLE)' })
  @ApiResponse({ status: 400, description: 'Invalid period' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPerformanceRiskAdjusted(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioRiskAdjustedMetricsUseCase.execute({
      portfolioId,
      userId: principal.userId,
      startDate,
      endDate,
    });
    return { data };
  }

  @Get(':portfolioId/performance/relative-risk')
  @ApiOperation({
    summary:
      'Get benchmark-relative risk (Beta, Correlation, Tracking Error) — identical economic intervals vs IBOV, BRL only',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Benchmark-relative risk (may be UNAVAILABLE)' })
  @ApiResponse({ status: 400, description: 'Missing/invalid benchmark or period' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPerformanceRelativeRisk(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('benchmark') benchmark: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioBenchmarkRelativeRiskUseCase.execute({
      portfolioId,
      userId: principal.userId,
      startDate,
      endDate,
      benchmark,
    });
    return { data };
  }

  @Get(':portfolioId/performance/active')
  @ApiOperation({
    summary:
      "Get active performance (Jensen's Alpha, Information Ratio, Treynor) — period-consistent TWR/CDI/IBOV/Beta, BRL only",
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Active performance (may be UNAVAILABLE)' })
  @ApiResponse({ status: 400, description: 'Invalid period' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPerformanceActive(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioActivePerformanceUseCase.execute({
      portfolioId,
      userId: principal.userId,
      startDate,
      endDate,
    });
    return { data };
  }

  @Get(':portfolioId/performance/rolling')
  @ApiOperation({
    summary:
      'Get rolling analytics (volatility, Sharpe, Beta) over 20/60/120 economic observations — canonical 3I/3J/3K sources',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Rolling analytics (may be UNAVAILABLE)' })
  @ApiResponse({ status: 400, description: 'Invalid window or period' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPerformanceRolling(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('window') window: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioRollingAnalyticsUseCase.execute({
      portfolioId,
      userId: principal.userId,
      startDate,
      endDate,
      window,
    });
    return { data };
  }

  @Get(':portfolioId/performance/tail-risk')
  @ApiOperation({
    summary:
      'Get downside & tail risk (downside deviation, semideviation, historical VaR/CVaR) — empirical, economic TWR returns',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiResponse({ status: 200, description: 'Tail risk metrics (may be UNAVAILABLE)' })
  @ApiResponse({ status: 400, description: 'Invalid confidence level or period' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getPerformanceTailRisk(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('confidenceLevel') confidenceLevel: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioTailRiskMetricsUseCase.execute({
      portfolioId,
      userId: principal.userId,
      startDate,
      endDate,
      confidenceLevel,
    });
    return { data };
  }

  @Post(':portfolioId/performance/scenarios/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Run a deterministic what-if scenario over the portfolio market value (equity/benchmark/rate/combined)',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['scenario'],
      properties: {
        asOf: { type: 'string', example: '2026-09-23' },
        scenario: {
          type: 'object',
          required: ['type'],
          properties: {
            type: {
              type: 'string',
              enum: ['EQUITY_PRICE_SHOCK', 'BENCHMARK_SHOCK', 'RATE_SHOCK', 'COMBINED'],
            },
            shockPercentage: { type: 'string', example: '-10' },
            benchmarkId: { type: 'string', enum: ['IBOV'] },
            rateShockBps: { type: 'string', example: '100' },
            equityShockPercentage: { type: 'string', example: '-15' },
            benchmarkShockPercentage: { type: 'string', example: '-10' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Deterministic scenario result (what-if, not a forecast)',
  })
  @ApiResponse({ status: 400, description: 'Invalid scenario, shock bounds, conflict, or asOf' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async runScenario(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Body(new ZodValidationPipe(RunScenarioBodySchema)) body: RunScenarioBody,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.runPortfolioScenarioUseCase.execute({
      portfolioId,
      userId: principal.userId,
      asOf: body.asOf,
      scenario: body.scenario as unknown as ScenarioDefinition,
    });
    return { data };
  }

  @Get(':portfolioId/intelligence/summary')
  @ApiOperation({
    summary:
      'Get the deterministic Portfolio Intelligence Summary — consolidated read models over one shared period, with data quality and objective observations',
  })
  @ApiParam({ name: 'portfolioId', description: 'UUID of the portfolio' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date in YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date in YYYY-MM-DD' })
  @ApiQuery({
    name: 'benchmark',
    required: false,
    description: 'Selected benchmark: IBOV, CDI, or none',
  })
  @ApiResponse({ status: 200, description: 'Portfolio intelligence summary (may be PARTIAL)' })
  @ApiResponse({ status: 400, description: 'Invalid period' })
  @ApiResponse({ status: 404, description: 'Portfolio not found' })
  async getIntelligenceSummary(
    @Param('portfolioId', UUIDParamPipe) portfolioId: string,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('benchmark') benchmark: string | undefined,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    const data = await this.getPortfolioIntelligenceSummaryUseCase.execute({
      portfolioId,
      userId: principal.userId,
      startDate,
      endDate,
      benchmark,
    });
    return { data };
  }
}
