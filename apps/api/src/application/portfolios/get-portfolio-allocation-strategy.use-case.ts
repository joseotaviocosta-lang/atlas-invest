import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type { IAllocationStrategyRepository, IPortfolioRepository } from '@atlas/database';
import {
  compareAllocationToStrategy,
  InvalidAllocationStrategyError,
  parsePercentToBasisPoints,
  STRATEGY_MIN_COVERAGE_BP,
  STRATEGY_TOLERANCE_BP,
  validateStrategyTargets,
  type ComparisonState,
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
   * multi-currency without translated totals, or coverage below the floor,
   * yields UNAVAILABLE rows instead of a misleading comparison.
   */
  async compareStrategy(
    portfolioId: string,
    userId?: string,
  ): Promise<AllocationStrategyComparison | null> {
    const strategy = await this.getStrategy(portfolioId, userId);
    if (!strategy) return null;
    const allocation = await this.allocation.execute({ portfolioId, userId: userId ?? '' });
    const coverage = allocation.valuationCoveragePercent;
    const coverageBp = parsePercentToBasisPoints(coverage);
    if (coverageBp === null || coverageBp < STRATEGY_MIN_COVERAGE_BP) {
      return {
        rows: strategy.targets.map((target) => ({
          category: target.category,
          targetBp: target.targetBp,
          currentBp: null,
          deviationBp: null,
          state: 'UNAVAILABLE' as const,
        })),
        outsideTolerance: [],
        worstGap: null,
        coveragePercent: coverage,
        qualified: true,
        denominator: 'KNOWN_VALUE',
        asOf: allocation.asOf,
      };
    }

    const translated = allocation.translatedAllocation;
    const buckets = Object.values(allocation.currencies);
    let weights: Array<{ category: string; currentBp: number | null }>;
    let denominator: string;
    if (translated && translated.status === 'AVAILABLE') {
      weights = translated.byAssetClass.map((item) => ({
        category: item.assetClass,
        currentBp: parsePercentToBasisPoints(item.allocationPercent),
      }));
      denominator = `KNOWN_VALUE_${translated.reportingCurrency}`;
    } else if (buckets.length === 1 && buckets[0]) {
      weights = buckets[0].byAssetClass.map((item) => ({
        category: item.assetClass,
        currentBp: parsePercentToBasisPoints(item.allocationPercent),
      }));
      denominator = `KNOWN_VALUE_${buckets[0].currency}`;
    } else {
      return {
        rows: strategy.targets.map((target) => ({
          category: target.category,
          targetBp: target.targetBp,
          currentBp: null,
          deviationBp: null,
          state: 'UNAVAILABLE' as const,
        })),
        outsideTolerance: [],
        worstGap: null,
        coveragePercent: coverage,
        qualified: true,
        denominator: 'KNOWN_VALUE',
        asOf: allocation.asOf,
      };
    }

    if (weights.some((weight) => weight.currentBp === null)) {
      return {
        rows: strategy.targets.map((target) => ({
          category: target.category,
          targetBp: target.targetBp,
          currentBp: null,
          deviationBp: null,
          state: 'UNAVAILABLE' as const,
        })),
        outsideTolerance: [],
        worstGap: null,
        coveragePercent: coverage,
        qualified: true,
        denominator,
        asOf: allocation.asOf,
      };
    }

    const comparison = compareAllocationToStrategy({
      targets: strategy.targets,
      current: weights,
      toleranceBp: STRATEGY_TOLERANCE_BP,
    });
    return {
      rows: comparison.rows,
      outsideTolerance: comparison.outsideTolerance,
      worstGap: comparison.worstGap,
      coveragePercent: coverage,
      qualified: coverageBp < 10000,
      denominator,
      asOf: allocation.asOf,
    };
  }
}
