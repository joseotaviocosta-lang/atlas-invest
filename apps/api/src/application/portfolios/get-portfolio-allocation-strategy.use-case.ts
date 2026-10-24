import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type { IAllocationStrategyRepository, IPortfolioRepository } from '@atlas/database';
import {
  compareAllocationToStrategy,
  InvalidAllocationScenarioError,
  InvalidAllocationStrategyError,
  parsePercentToBasisPoints,
  parseScenarioAmountToCanonical,
  simulateAllocationScenario,
  STRATEGY_MIN_COVERAGE_BP,
  STRATEGY_TOLERANCE_BP,
  validateScenarioInput,
  validateStrategyTargets,
  type ComparisonState,
  type SimulatedScenario,
} from '@atlas/portfolio-strategy';
import { ALLOCATION_STRATEGY_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';
import { GetPortfolioAllocationUseCase } from '../valuation/get-portfolio-allocation.use-case';

export interface AllocationStrategyTargetInput {
  category: string;
  targetBp: number;
}

export interface AllocationStrategyComparisonRow {
  category: string;
  targetBp: number;
  currentBp: number | null;
  currentValue: string | null;
  deviationBp: number | null;
  state: ComparisonState;
}

export interface AllocationStrategyComparison {
  rows: AllocationStrategyComparisonRow[];
  outsideTolerance: string[];
  worstGap: { category: string; deviationBp: number } | null;
  coveragePercent: string | null;
  qualified: boolean;
  denominator: string;
  asOf: string | null;
}

export interface AllocationStrategyReadModel {
  portfolioId: string;
  targets: Array<{ category: string; targetBp: number }>;
  updatedAt: string | null;
}

/**
 * Phase 5Q-C — user-defined allocation strategy (per-portfolio intent).
 *
 * The user declares targets; the server compares against the canonical
 * allocation read model. Total must be exactly 10000bp; writing replaces
 * atomically (never a partial strategy). No recommendations, no trades.
 */
@Injectable()
export class GetPortfolioAllocationStrategyUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(ALLOCATION_STRATEGY_REPOSITORY)
    private readonly strategies: IAllocationStrategyRepository,
    @Inject(GetPortfolioAllocationUseCase)
    private readonly allocation: GetPortfolioAllocationUseCase,
  ) {}

  private async verifyOwnership(portfolioId: string, userId?: string): Promise<void> {
    const portfolio = userId
      ? await this.portfolios.findByIdAndUserId(portfolioId, userId)
      : await this.portfolios.findById(portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
  }

  async getStrategy(
    portfolioId: string,
    userId?: string,
  ): Promise<AllocationStrategyReadModel | null> {
    await this.verifyOwnership(portfolioId, userId);
    const rows = await this.strategies.listByPortfolio(portfolioId);
    if (rows.length === 0) return null;
    return {
      portfolioId,
      targets: rows.map((row) => ({ category: row.category, targetBp: row.targetBp })),
      updatedAt: rows.reduce<string | null>(
        (latest, row) =>
          latest === null || row.updatedAt.toISOString() > latest
            ? row.updatedAt.toISOString()
            : latest,
        null,
      ),
    };
  }

  async replaceStrategy(command: {
    portfolioId: string;
    userId?: string;
    targets: AllocationStrategyTargetInput[];
  }): Promise<AllocationStrategyReadModel> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    const validation = validateStrategyTargets(command.targets);
    if (!validation.valid) {
      const codes = validation.errors.map((error) => error.code).join(',');
      throw new InvalidAllocationStrategyError(`Invalid allocation strategy: ${codes}`);
    }
    // Normalize: drop explicit zeros deterministically (0 == absent).
    const normalized = command.targets.filter((target) => target.targetBp !== 0);
    const rows = await this.strategies.replace(command.portfolioId, normalized);
    return {
      portfolioId: command.portfolioId,
      targets: rows.map((row) => ({ category: row.category, targetBp: row.targetBp })),
      updatedAt:
        rows.length > 0
          ? rows.reduce(
              (latest, row) =>
                row.updatedAt.toISOString() > latest ? row.updatedAt.toISOString() : latest,
              rows[0]!.updatedAt.toISOString(),
            )
          : new Date().toISOString(),
    };
  }

  async clearStrategy(portfolioId: string, userId?: string): Promise<void> {
    await this.verifyOwnership(portfolioId, userId);
    await this.strategies.clear(portfolioId);
  }

  /**
   * Compares the declared strategy against current allocation. Fail-closed:
   * multi-currency without translated totals, coverage below the floor, or
   * unparseable weights yield UNAVAILABLE rows instead of a misleading
   * comparison. Empty allocation yields UNAVAILABLE rows as well: with no
   * positions, no deviation can be computed.
   */
  async compareStrategy(
    portfolioId: string,
    userId?: string,
  ): Promise<AllocationStrategyComparison | null> {
    const strategy = await this.getStrategy(portfolioId, userId);
    if (!strategy) return null;
    const basis = await this.loadComparisonBasis(portfolioId, userId);
    const unavailable = (coverage: string | null, asOf: string | null, denominator: string) => ({
      rows: strategy.targets.map((target) => ({
        category: target.category,
        targetBp: target.targetBp,
        currentBp: null,
        currentValue: null,
        deviationBp: null,
        state: 'UNAVAILABLE' as const,
      })),
      outsideTolerance: [],
      worstGap: null,
      coveragePercent: coverage,
      qualified: coverage !== null,
      denominator,
      asOf,
    });
    if (!basis) {
      const allocation = await this.allocation.execute({ portfolioId, userId: userId ?? '' });
      return unavailable(allocation.valuationCoveragePercent, allocation.asOf, 'KNOWN_VALUE');
    }
    const comparison = compareAllocationToStrategy({
      targets: strategy.targets,
      current: basis.weights.map(({ category, currentBp }) => ({ category, currentBp })),
      toleranceBp: STRATEGY_TOLERANCE_BP,
    });
    return {
      rows: comparison.rows.map((row) => ({
        ...row,
        currentValue:
          basis.weights.find((weight) => weight.category === row.category)?.value ?? null,
      })),
      outsideTolerance: comparison.outsideTolerance,
      worstGap: comparison.worstGap,
      coveragePercent: basis.coverage,
      qualified: basis.qualified,
      denominator: basis.denominator,
      asOf: basis.asOf,
    };
  }

  /**
   * Comparison basis shared by read and simulation: current weights and
   * values per category, or null when no sound comparison is possible
   * (coverage floor, multi-currency without translation, unparseable
   * weights, empty portfolio). Single place where allocation read models
   * turn into comparable numbers.
   */
  private async loadComparisonBasis(
    portfolioId: string,
    userId: string | undefined,
  ): Promise<{
    weights: Array<{ category: string; currentBp: number; value: string }>;
    coverage: string;
    qualified: boolean;
    denominator: string;
    asOf: string | null;
  } | null> {
    const allocation = await this.allocation.execute({ portfolioId, userId: userId ?? '' });
    const coverage = allocation.valuationCoveragePercent;
    const coverageBp = parsePercentToBasisPoints(coverage);
    if (coverageBp === null || coverageBp < STRATEGY_MIN_COVERAGE_BP) return null;
    if (allocation.status === 'EMPTY') return null;
    const translated = allocation.translatedAllocation;
    const buckets = Object.values(allocation.currencies);
    const readWeights = (
      entries: Array<{
        assetClass?: string;
        category?: string;
        allocationPercent: string;
        value: string | null;
      }>,
      denominator: string,
    ): {
      weights: Array<{ category: string; currentBp: number; value: string }>;
      coverage: string;
      qualified: boolean;
      denominator: string;
      asOf: string | null;
    } | null => {
      const weights: Array<{ category: string; currentBp: number; value: string }> = [];
      for (const entry of entries) {
        const category = entry.assetClass ?? entry.category;
        if (category === undefined) return null;
        const currentBp = parsePercentToBasisPoints(entry.allocationPercent);
        if (currentBp === null || entry.value === null) return null;
        weights.push({ category, currentBp, value: entry.value });
      }
      return {
        weights,
        coverage,
        qualified: coverageBp < 10000,
        denominator,
        asOf: allocation.asOf,
      };
    };
    if (translated && translated.status === 'AVAILABLE') {
      return readWeights(
        translated.byAssetClass.map((item) => ({
          assetClass: item.assetClass,
          allocationPercent: item.allocationPercent,
          value: item.reportingMarketValue?.amount ?? null,
        })),
        `KNOWN_VALUE_${translated.reportingCurrency}`,
      );
    }
    if (buckets.length === 1 && buckets[0]) {
      return readWeights(
        buckets[0].byAssetClass.map((item) => ({
          assetClass: item.assetClass,
          allocationPercent: item.allocationPercent,
          value: item.marketValue?.amount ?? null,
        })),
        `KNOWN_VALUE_${buckets[0].currency}`,
      );
    }
    return null;
  }

  /**
   * Simulates a user-declared contribution against current allocation.
   * Hypothetical only: persists nothing, executes nothing. Reuses the
   * engine comparison for before/after deviations.
   */
  async simulateScenario(command: {
    portfolioId: string;
    userId?: string;
    type: string;
    changes: Array<{ category: string; amount: string }>;
  }): Promise<{
    comparison: AllocationStrategyComparison | null;
    scenario: {
      totals: { current: string; scenario: string; projected: string; currency: string };
      rows: Array<{
        category: string;
        targetBp: number;
        currentBp: number | null;
        scenarioAmount: string;
        projectedValue: string;
        projectedBp: number;
        currentDeviationBp: number | null;
        projectedDeviationBp: number;
        state: ComparisonState;
      }>;
      beforeOutsideCount: number;
      afterOutsideCount: number;
      beforeTotalAbsDeviationBp: number;
      afterTotalAbsDeviationBp: number;
      worstGap: { category: string; deviationBp: number } | null;
      qualified: boolean;
      denominator: string;
      asOf: string | null;
    } | null;
    limitations: string[];
  }> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    // Locale amounts ('10.000,50') are parsed to canonical decimals here;
    // the engine itself only accepts canonical form. Never floats.
    const canonicalChanges: Array<{ category: string; amount: string }> = [];
    for (const change of command.changes) {
      const canonical =
        typeof change.amount === 'string' ? parseScenarioAmountToCanonical(change.amount) : null;
      if (canonical === null) {
        throw new InvalidAllocationScenarioError('Invalid scenario: INVALID_AMOUNT');
      }
      canonicalChanges.push({ category: change.category, amount: canonical });
    }
    const validation = validateScenarioInput({ type: command.type, changes: canonicalChanges });
    if (!validation.valid) {
      throw new InvalidAllocationScenarioError(
        `Invalid scenario: ${validation.errors.map((error) => error.code).join(',')}`,
      );
    }
    const strategy = await this.getStrategy(command.portfolioId, command.userId);
    if (!strategy) {
      throw new InvalidAllocationScenarioError(
        'Declare metas de alocação antes de simular: no strategy defined for this portfolio',
      );
    }
    const basis = await this.loadComparisonBasis(command.portfolioId, command.userId);
    if (!basis) {
      const allocation = await this.allocation.execute({
        portfolioId: command.portfolioId,
        userId: command.userId ?? '',
      });
      return {
        comparison: {
          rows: strategy.targets.map((target) => ({
            category: target.category,
            targetBp: target.targetBp,
            currentBp: null,
            currentValue: null,
            deviationBp: null,
            state: 'UNAVAILABLE' as const,
          })),
          outsideTolerance: [],
          worstGap: null,
          coveragePercent: allocation.valuationCoveragePercent,
          qualified: true,
          denominator: 'KNOWN_VALUE',
          asOf: allocation.asOf,
        },
        scenario: null,
        limitations: ['INSUFFICIENT_DATA'],
      };
    }
    const currency = basis.denominator.replace(/^KNOWN_VALUE_/, '') || 'BRL';
    const result = simulateAllocationScenario({
      changes: canonicalChanges,
      currency,
      current: basis.weights.map((weight) => ({
        category: weight.category,
        value: weight.value,
      })),
      targets: strategy.targets,
    });
    const limitations: string[] = [];
    if (basis.qualified) limitations.push('PARTIAL_COVERAGE');
    return {
      comparison: await this.compareStrategy(command.portfolioId, command.userId),
      scenario: {
        totals: result.totals,
        rows: result.rows,
        beforeOutsideCount: result.beforeOutsideCount,
        afterOutsideCount: result.afterOutsideCount,
        beforeTotalAbsDeviationBp: result.beforeTotalAbsDeviationBp,
        afterTotalAbsDeviationBp: result.afterTotalAbsDeviationBp,
        worstGap: result.worstGap,
        qualified: basis.qualified,
        denominator: basis.denominator,
        asOf: basis.asOf,
      },
      limitations,
    };
  }

  /**
   * Phase 5Q-E — simulates N pre-validated change-sets against ONE shared
   * basis (same strategy, same current allocation, same coverage).
   * Structural same-basis guarantee for saved-scenario detail/compare:
   * the basis loads once here, never once per scenario. Changes must
   * already be canonical decimals (DB/locales are parsed by the caller).
   * Throws InvalidAllocationScenarioError on invalid sets (fail-closed);
   * returns reason NO_STRATEGY/INSUFFICIENT_DATA instead of throwing when
   * the live state cannot support a simulation — saved inputs stay stored.
   */
  async simulateMany(command: {
    portfolioId: string;
    userId?: string;
    changesList: Array<Array<{ category: string; amount: string }>>;
  }): Promise<{
    strategy: AllocationStrategyReadModel | null;
    reason: 'OK' | 'NO_STRATEGY' | 'INSUFFICIENT_DATA';
    currency: string | null;
    qualified: boolean;
    denominator: string;
    asOf: string | null;
    coverage: string | null;
    results: Array<SimulatedScenario | null>;
    comparison: AllocationStrategyComparison | null;
  }> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    for (const changes of command.changesList) {
      const validation = validateScenarioInput({ type: 'CONTRIBUTION', changes });
      if (!validation.valid) {
        throw new InvalidAllocationScenarioError(
          `Invalid scenario: ${validation.errors.map((error) => error.code).join(',')}`,
        );
      }
    }
    const strategy = await this.getStrategy(command.portfolioId, command.userId);
    if (!strategy) {
      return {
        strategy: null,
        reason: 'NO_STRATEGY',
        currency: null,
        qualified: false,
        denominator: 'KNOWN_VALUE',
        asOf: null,
        coverage: null,
        results: command.changesList.map(() => null),
        comparison: null,
      };
    }
    const basis = await this.loadComparisonBasis(command.portfolioId, command.userId);
    if (!basis) {
      const allocation = await this.allocation.execute({
        portfolioId: command.portfolioId,
        userId: command.userId ?? '',
      });
      return {
        strategy,
        reason: 'INSUFFICIENT_DATA',
        currency: null,
        qualified: false,
        denominator: 'KNOWN_VALUE',
        coverage: allocation.valuationCoveragePercent,
        asOf: allocation.asOf,
        results: command.changesList.map(() => null),
        comparison: await this.compareStrategy(command.portfolioId, command.userId),
      };
    }
    const currency = basis.denominator.replace(/^KNOWN_VALUE_/, '') || 'BRL';
    const current = basis.weights.map((weight) => ({
      category: weight.category,
      value: weight.value,
    }));
    const results = command.changesList.map((changes) =>
      simulateAllocationScenario({ changes, currency, current, targets: strategy.targets }),
    );
    return {
      strategy,
      reason: 'OK',
      currency,
      qualified: basis.qualified,
      denominator: basis.denominator,
      asOf: basis.asOf,
      coverage: basis.coverage,
      results,
      comparison: await this.compareStrategy(command.portfolioId, command.userId),
    };
  }
}
