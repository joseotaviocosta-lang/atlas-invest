import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IPortfolioRepository, ITransactionRepository, IAssetRepository } from '@atlas/database';
import { LocalDate, Quantity } from '@atlas/domain';
import { HistoricalMarketDataProvider } from '@atlas/market-data';
import {
  runScenario,
  validateScenario,
  InvalidScenarioError,
  ScenarioDefinition,
} from '@atlas/scenario-engine';
import {
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
  ASSET_REPOSITORY,
} from '../../database/tokens';
import { HISTORICAL_MARKET_DATA_PROVIDER } from '../../market-data/tokens';
import { PortfolioScenarioReadModel, ScenarioCurrencyReadModel } from './scenario-read-models';
import { ScenarioSnapshotBuilder } from './scenario-snapshot.builder';
import { GetPortfolioBenchmarkRelativeRiskUseCase } from './get-portfolio-benchmark-relative-risk.use-case';

const BETA_LOOKBACK_DAYS = 365;

function todayCivil(): LocalDate {
  const now = new Date();
  return LocalDate.fromParts(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

function addDaysCivil(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return LocalDate.fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function scenarioNeedsBeta(scenario: ScenarioDefinition): boolean {
  if (scenario.type === 'BENCHMARK_SHOCK') return true;
  if (scenario.type === 'COMBINED') {
    return scenario.benchmarkShockPercentage !== undefined;
  }
  return false;
}

/**
 * RunPortfolioScenarioUseCase (3O, ADR-159–ADR-165).
 *
 * Deterministic what-if analysis over the portfolio's market value. Pure
 * scenario transformation in @atlas/scenario-engine; this use case only builds
 * the snapshot (reusing the valuation pipeline) and, for benchmark shocks,
 * reuses the 3K historical portfolio Beta (never a per-asset Beta, never a
 * fallback to 1). NO ledger/portfolio mutation, NO persistence, NO FX, NO
 * probability/forecast.
 */
@Injectable()
export class RunPortfolioScenarioUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(HISTORICAL_MARKET_DATA_PROVIDER)
    private readonly historicalProvider: HistoricalMarketDataProvider,
    @Inject(GetPortfolioBenchmarkRelativeRiskUseCase)
    private readonly relativeRiskUseCase: GetPortfolioBenchmarkRelativeRiskUseCase,
  ) {}

  async execute(params: {
    portfolioId: string;
    userId: string;
    asOf?: string;
    scenario: ScenarioDefinition;
  }): Promise<PortfolioScenarioReadModel> {
    const portfolio = await this.portfolioRepository.findById(params.portfolioId);
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: `Portfolio with id '${params.portfolioId}' not found`,
        code: 'PORTFOLIO.NOT_FOUND',
      });
    }

    let asOf: LocalDate | undefined;
    if (params.asOf) {
      try {
        asOf = LocalDate.from(params.asOf);
      } catch (err: unknown) {
        throw new BadRequestException({
          message: (err as Error).message,
          code: 'SCENARIO.INVALID_AS_OF',
        });
      }
      if (asOf.compare(todayCivil()) > 0) {
        throw new BadRequestException({
          message: `Invalid asOf '${params.asOf}': must not be in the future`,
          code: 'SCENARIO.INVALID_AS_OF',
        });
      }
    }
    const effectiveAsOf = asOf ?? todayCivil();

    try {
      validateScenario(params.scenario);
    } catch (err: unknown) {
      if (err instanceof InvalidScenarioError) {
        throw new BadRequestException({ message: err.message, code: err.code });
      }
      throw err;
    }

    const snapshotBuilder = new ScenarioSnapshotBuilder(
      this.transactionRepository,
      this.assetRepository,
      this.historicalProvider,
    );
    const snapshots = await snapshotBuilder.build({
      portfolioId: params.portfolioId,
      asOf: effectiveAsOf,
    });

    // Benchmark shock: reuse the 3K historical portfolio Beta (BRL), never a
    // per-asset Beta and never a fallback to 1.
    let portfolioBeta: Quantity | null = null;
    if (scenarioNeedsBeta(params.scenario)) {
      const startDate = addDaysCivil(effectiveAsOf, -BETA_LOOKBACK_DAYS);
      const relative = await this.relativeRiskUseCase.execute({
        portfolioId: params.portfolioId,
        userId: params.userId,
        startDate: startDate.toString(),
        endDate: effectiveAsOf.toString(),
        benchmark: 'IBOV',
      });
      const beta = relative.currencies.BRL?.beta ?? null;
      portfolioBeta = beta !== null ? Quantity.from(beta) : null;
    }

    const betaByCurrency: Record<string, Quantity | null> = {};
    for (const snapshot of snapshots) {
      betaByCurrency[snapshot.currency] = snapshot.currency === 'BRL' ? portfolioBeta : null;
    }

    const result = runScenario({
      scenario: params.scenario,
      snapshots,
      portfolioBetaByCurrency: betaByCurrency,
    });

    const currencies: Record<string, ScenarioCurrencyReadModel> = {};
    for (const currency of result.currencies) {
      currencies[currency.currency] = {
        currency: currency.currency,
        status: currency.status,
        baseValue: currency.baseValue ? currency.baseValue.amount : null,
        stressedValue: currency.stressedValue ? currency.stressedValue.amount : null,
        absoluteImpact: currency.absoluteImpact ? currency.absoluteImpact.amount : null,
        percentageImpact: currency.percentageImpact ? currency.percentageImpact.value : null,
        positionCount: currency.positionCount,
        valuedPositionCount: currency.valuedPositionCount,
        unvaluedPositionCount: currency.unvaluedPositionCount,
        components: currency.components.map((component) => ({
          componentType: component.componentType,
          status: component.status,
          baseValue: component.baseValue ? component.baseValue.amount : null,
          stressedValue: component.stressedValue ? component.stressedValue.amount : null,
          absoluteImpact: component.absoluteImpact ? component.absoluteImpact.amount : null,
          percentageImpact: component.percentageImpact ? component.percentageImpact.value : null,
          reason: component.reason,
        })),
      };
    }

    return {
      portfolioId: params.portfolioId,
      asOf: effectiveAsOf.toString(),
      scenario: result.scenario,
      currencies,
      status: result.status,
      dataAvailability: result.dataAvailability,
    };
  }
}
