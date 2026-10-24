import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import type {
  IAllocationScenarioRepository,
  IPortfolioRepository,
  PortfolioAllocationScenarioRow,
} from '@atlas/database';
import {
  addDecimals,
  buildScenarioCopyName,
  compareScenarioResults,
  InvalidAllocationScenarioError,
  MAX_SAVED_SCENARIOS_PER_PORTFOLIO,
  parseScenarioAmountToCanonical,
  validateScenarioInput,
  validateScenarioName,
  type SimulatedScenario,
} from '@atlas/portfolio-strategy';
import { ALLOCATION_SCENARIO_REPOSITORY, PORTFOLIO_REPOSITORY } from '../../database/tokens';
import { GetPortfolioAllocationStrategyUseCase } from './get-portfolio-allocation-strategy.use-case';

export interface SavedScenarioChangeView {
  category: string;
  amount: string;
}

export interface SavedScenarioView {
  id: string;
  portfolioId: string;
  name: string;
  type: string;
  changes: SavedScenarioChangeView[];
  /** Sum of hypothetical amounts (canonical decimal, input math only). */
  hypotheticalTotal: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioLiveResultView {
  totals: { current: string; scenario: string; projected: string; currency: string };
  rows: SimulatedScenario['rows'];
  beforeOutsideCount: number;
  afterOutsideCount: number;
  beforeTotalAbsDeviationBp: number;
  afterTotalAbsDeviationBp: number;
  worstGap: { category: string; deviationBp: number } | null;
  qualified: boolean;
  denominator: string;
  generatedAt: string;
  marketDataAsOf: string | null;
}

/**
 * Phase 5Q-E — saved hypothetical allocation scenarios.
 *
 * Persists ONLY the user's declared hypothesis (name + per-category
 * hypothetical amounts). Projected values, weights, deviations and
 * coverage are never stored: detail/compare always recompute live
 * against the current portfolio + current strategy. No choosing between
 * scenarios, no scoring, no recommendation, no execution — facts only.
 */
@Injectable()
export class PortfolioAllocationScenariosUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(ALLOCATION_SCENARIO_REPOSITORY)
    private readonly scenarios: IAllocationScenarioRepository,
    @Inject(GetPortfolioAllocationStrategyUseCase)
    private readonly strategies: GetPortfolioAllocationStrategyUseCase,
  ) {}

  private async verifyOwnership(portfolioId: string, userId?: string): Promise<void> {
    const portfolio = userId
      ? await this.portfolios.findByIdAndUserId(portfolioId, userId)
      : await this.portfolios.findById(portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
  }

  private toView(row: PortfolioAllocationScenarioRow): SavedScenarioView {
    let total = '0';
    for (const change of row.changes) {
      total = addDecimals(total, change.amount);
    }
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      name: row.name,
      type: row.type,
      changes: row.changes.map((change) => ({
        category: change.category,
        amount: change.amount,
      })),
      hypotheticalTotal: total,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Validates raw user input (name + locale amounts) into canonical form.
   * Reuses the 5Q-D engine validation — no second rule implementation.
   */
  private parseAndValidateInput(input: {
    name: unknown;
    type: string;
    changes: Array<{ category: string; amount: string }>;
  }): { name: string; changes: Array<{ category: string; amount: string }> } {
    const nameValidation = validateScenarioName(input.name);
    if (!nameValidation.valid) {
      throw new InvalidAllocationScenarioError(
        `Invalid scenario name: ${nameValidation.errors.map((error) => error.code).join(',')}`,
      );
    }
    const canonicalChanges: Array<{ category: string; amount: string }> = [];
    for (const change of input.changes ?? []) {
      const canonical =
        typeof change?.amount === 'string' ? parseScenarioAmountToCanonical(change.amount) : null;
      if (canonical === null) {
        throw new InvalidAllocationScenarioError('Invalid scenario: INVALID_AMOUNT');
      }
      canonicalChanges.push({ category: change.category, amount: canonical });
    }
    const validation = validateScenarioInput({ type: input.type, changes: canonicalChanges });
    if (!validation.valid) {
      throw new InvalidAllocationScenarioError(
        `Invalid scenario: ${validation.errors.map((error) => error.code).join(',')}`,
      );
    }
    return { name: nameValidation.name, changes: canonicalChanges };
  }

  async createScenario(command: {
    portfolioId: string;
    userId?: string;
    name: unknown;
    type: string;
    changes: Array<{ category: string; amount: string }>;
  }): Promise<SavedScenarioView> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    const parsed = this.parseAndValidateInput({
      name: command.name,
      type: command.type,
      changes: command.changes,
    });
    const count = await this.scenarios.countByPortfolio(command.portfolioId);
    if (count >= MAX_SAVED_SCENARIOS_PER_PORTFOLIO) {
      throw new InvalidAllocationScenarioError(
        'Você atingiu o limite de cenários salvos nesta carteira.',
      );
    }
    const created = await this.scenarios.create(command.portfolioId, {
      name: parsed.name,
      type: command.type,
      changes: parsed.changes,
    });
    return this.toView(created);
  }

  async listScenarios(
    portfolioId: string,
    userId?: string,
  ): Promise<{ scenarios: SavedScenarioView[]; limit: number }> {
    await this.verifyOwnership(portfolioId, userId);
    const rows = await this.scenarios.listByPortfolio(portfolioId);
    return {
      scenarios: rows.map((row) => this.toView(row)),
      limit: MAX_SAVED_SCENARIOS_PER_PORTFOLIO,
    };
  }

  private async loadScoped(scenarioId: string, portfolioId: string, userId?: string) {
    await this.verifyOwnership(portfolioId, userId);
    const row = await this.scenarios.findByIdAndPortfolio(scenarioId, portfolioId);
    if (!row) {
      throw new EntityNotFoundError('AllocationScenario', scenarioId);
    }
    return row;
  }

  private toLiveView(
    result: SimulatedScenario,
    qualified: boolean,
    denominator: string,
    marketDataAsOf: string | null,
  ): ScenarioLiveResultView {
    return {
      totals: result.totals,
      rows: result.rows,
      beforeOutsideCount: result.beforeOutsideCount,
      afterOutsideCount: result.afterOutsideCount,
      beforeTotalAbsDeviationBp: result.beforeTotalAbsDeviationBp,
      afterTotalAbsDeviationBp: result.afterTotalAbsDeviationBp,
      worstGap: result.worstGap,
      qualified,
      denominator,
      generatedAt: new Date().toISOString(),
      marketDataAsOf,
    };
  }

  async getScenarioDetail(command: {
    scenarioId: string;
    portfolioId: string;
    userId?: string;
  }): Promise<{
    saved: SavedScenarioView;
    strategy: { targets: Array<{ category: string; targetBp: number }> } | null;
    live: ScenarioLiveResultView | null;
    limitations: string[];
  }> {
    const row = await this.loadScoped(command.scenarioId, command.portfolioId, command.userId);
    const saved = this.toView(row);
    // Saved inputs were valid at write time; a domain change since then
    // fails safely with NEEDS_REVIEW — never silently dropped.
    const stillValid = validateScenarioInput({
      type: row.type,
      changes: row.changes.map((change) => ({ category: change.category, amount: change.amount })),
    });
    if (!stillValid.valid) {
      return { saved, strategy: null, live: null, limitations: ['NEEDS_REVIEW'] };
    }
    const simulated = await this.strategies.simulateMany({
      portfolioId: command.portfolioId,
      userId: command.userId,
      changesList: [
        row.changes.map((change) => ({ category: change.category, amount: change.amount })),
      ],
    });
    if (simulated.reason === 'NO_STRATEGY' || !simulated.strategy) {
      return {
        saved,
        strategy: null,
        live: null,
        limitations: ['NO_STRATEGY'],
      };
    }
    if (simulated.reason === 'INSUFFICIENT_DATA' || !simulated.results[0]) {
      return {
        saved,
        strategy: simulated.strategy ? { targets: simulated.strategy.targets } : null,
        live: null,
        limitations: ['INSUFFICIENT_DATA'],
      };
    }
    const result = simulated.results[0]!;
    const limitations = simulated.qualified ? ['PARTIAL_COVERAGE'] : [];
    return {
      saved,
      strategy: { targets: simulated.strategy.targets },
      live: {
        ...this.toLiveView(result, simulated.qualified, simulated.denominator, simulated.asOf),
      },
      limitations,
    };
  }

  async updateScenario(command: {
    scenarioId: string;
    portfolioId: string;
    userId?: string;
    name: unknown;
    type: string;
    changes: Array<{ category: string; amount: string }>;
  }): Promise<SavedScenarioView> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    const parsed = this.parseAndValidateInput({
      name: command.name,
      type: command.type,
      changes: command.changes,
    });
    const replaced = await this.scenarios.replace(command.scenarioId, command.portfolioId, {
      name: parsed.name,
      type: command.type,
      changes: parsed.changes,
    });
    if (!replaced) {
      throw new EntityNotFoundError('AllocationScenario', command.scenarioId);
    }
    return this.toView(replaced);
  }

  async deleteScenario(command: {
    scenarioId: string;
    portfolioId: string;
    userId?: string;
  }): Promise<void> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    const removed = await this.scenarios.remove(command.scenarioId, command.portfolioId);
    if (!removed) {
      throw new EntityNotFoundError('AllocationScenario', command.scenarioId);
    }
  }

  buildDuplicateName(name: string): string {
    return buildScenarioCopyName(name);
  }

  /**
   * Compares two saved scenarios factually. Both change-sets simulate
   * against ONE shared basis loaded inside simulateMany — the same
   * current allocation, strategy and coverage — and compareScenarioResults
   * re-checks the shared basis before comparing. Facts only, no recommendations.
   */
  async compareScenarios(command: {
    portfolioId: string;
    userId?: string;
    scenarioIds: [string, string];
  }): Promise<{
    scenarios: [SavedScenarioView, SavedScenarioView];
    comparison: {
      currency: string;
      sameScenarioTotal: boolean;
      sides: Array<{
        scenarioId: string;
        name: string;
        scenarioTotal: string;
        projectedTotal: string;
        outsideCount: number;
        totalAbsDeviationBp: number;
        projectedWeights: Array<{
          category: string;
          projectedBp: number;
          projectedDeviationBp: number;
        }>;
      }>;
    };
    limitations: string[];
    generatedAt: string;
    marketDataAsOf: string | null;
  }> {
    const [firstId, secondId] = command.scenarioIds;
    const [first, second] = await Promise.all([
      this.loadScoped(firstId, command.portfolioId, command.userId),
      this.loadScoped(secondId, command.portfolioId, command.userId),
    ]);
    const views = [this.toView(first!), this.toView(second!)] as [
      SavedScenarioView,
      SavedScenarioView,
    ];
    for (const row of [first!, second!] as const) {
      const stillValid = validateScenarioInput({
        type: row.type,
        changes: row.changes.map((change) => ({
          category: change.category,
          amount: change.amount,
        })),
      });
      if (!stillValid.valid) {
        throw new InvalidAllocationScenarioError(
          `Saved scenario needs review: ${row.id} (NEEDS_REVIEW)`,
        );
      }
    }
    const simulated = await this.strategies.simulateMany({
      portfolioId: command.portfolioId,
      userId: command.userId,
      changesList: [
        first!.changes.map((change) => ({ category: change.category, amount: change.amount })),
        second!.changes.map((change) => ({ category: change.category, amount: change.amount })),
      ],
    });
    if (simulated.reason !== 'OK' || !simulated.results[0] || !simulated.results[1]) {
      throw new InvalidAllocationScenarioError(
        simulated.reason === 'NO_STRATEGY'
          ? 'Define metas de alocação antes de comparar cenários: NO_STRATEGY'
          : 'Dados insuficientes para comparar cenários: INSUFFICIENT_DATA',
      );
    }
    const comparison = compareScenarioResults({
      left: { scenarioId: first!.id, name: first!.name, result: simulated.results[0] },
      right: { scenarioId: second!.id, name: second!.name, result: simulated.results[1] },
    });
    return {
      scenarios: views,
      comparison,
      limitations: simulated.qualified ? ['PARTIAL_COVERAGE'] : [],
      generatedAt: new Date().toISOString(),
      marketDataAsOf: simulated.asOf,
    };
  }
}
