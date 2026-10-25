import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '@atlas/database';
import { LocalDate, type Transaction } from '@atlas/domain';
import type {
  IAllocationScenarioRepository,
  IAssetRepository,
  IContributionPlanLinkRepository,
  IContributionPlanRepository,
  IPortfolioRepository,
  ITransactionRepository,
  PortfolioContributionPlanRow,
} from '@atlas/database';
import {
  addDecimals,
  canTransitionPlanStatus,
  deriveContributionCandidates,
  deriveContributionTracking,
  ELIGIBLE_CONTRIBUTION_TRANSACTION_TYPES,
  InvalidContributionPlanError,
  InvalidContributionTrackingError,
  MAX_ACTIVE_CONTRIBUTION_PLANS_PER_PORTFOLIO,
  parseScenarioAmountToCanonical,
  trackingCandidateWindow,
  validatePlanInput,
  validateScenarioInput,
  type ContributionTracking,
  type SimulatedScenario,
  type TrackingCandidate,
} from '@atlas/portfolio-strategy';
import { STRATEGY_CATEGORIES } from '@atlas/portfolio-strategy';
import {
  ALLOCATION_SCENARIO_REPOSITORY,
  ASSET_REPOSITORY,
  CONTRIBUTION_PLAN_LINK_REPOSITORY,
  CONTRIBUTION_PLAN_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { GetPortfolioAllocationStrategyUseCase } from './get-portfolio-allocation-strategy.use-case';
import { GetPortfolioAllocationUseCase } from '../valuation/get-portfolio-allocation.use-case';
import type { ScenarioLiveResultView } from './portfolio-allocation-scenarios.use-case';

export interface ContributionPlanItemView {
  category: string;
  amount: string;
}

export interface ContributionPlanView {
  id: string;
  portfolioId: string;
  name: string;
  plannedDate: string;
  status: string;
  currency: string;
  sourceScenarioId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: ContributionPlanItemView[];
  /** Sum of declared amounts (canonical decimal, input math only). */
  total: string;
}

/** Local civil "today" as `YYYY-MM-DD` from wall-clock fields (no instants). */
function todayCivilString(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Phase 5Q-F — user-declared contribution plans (future intent, not advice).
 *
 * Persists ONLY the declared intent. Marking complete/cancelled flips
 * status (plus completedAt on complete) — never creates transactions,
 * orders or ledger writes. Live impact always recomputes against the
 * current portfolio + strategy. Currency is server-derived (translated
 * totals, else the single holding currency, else the portfolio base
 * currency when the portfolio is still empty); multi-currency without a
 * consolidated basis blocks creation fail-closed.
 */
@Injectable()
export class PortfolioContributionPlansUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolios: IPortfolioRepository,
    @Inject(CONTRIBUTION_PLAN_REPOSITORY)
    private readonly plans: IContributionPlanRepository,
    @Inject(ALLOCATION_SCENARIO_REPOSITORY)
    private readonly scenarios: IAllocationScenarioRepository,
    @Inject(GetPortfolioAllocationStrategyUseCase)
    private readonly strategies: GetPortfolioAllocationStrategyUseCase,
    @Inject(GetPortfolioAllocationUseCase)
    private readonly allocation: GetPortfolioAllocationUseCase,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactions: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assets: IAssetRepository,
    @Inject(CONTRIBUTION_PLAN_LINK_REPOSITORY)
    private readonly links: IContributionPlanLinkRepository,
  ) {}

  private async verifyOwnership(portfolioId: string, userId?: string) {
    const portfolio = userId
      ? await this.portfolios.findByIdAndUserId(portfolioId, userId)
      : await this.portfolios.findById(portfolioId);
    if (!portfolio) {
      throw new EntityNotFoundError('Portfolio', portfolioId);
    }
    return portfolio;
  }

  private toView(row: PortfolioContributionPlanRow): ContributionPlanView {
    let total = '0';
    for (const item of row.items) {
      total = addDecimals(total, item.amount);
    }
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      name: row.name,
      plannedDate: row.plannedDate,
      status: row.status,
      currency: row.currency,
      sourceScenarioId: row.sourceScenarioId,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items: row.items.map((item) => ({ category: item.category, amount: item.amount })),
      total,
    };
  }

  /**
   * Resolves the single currency new plan amounts are declared in:
   * translated reporting currency, else the lone holding currency, else
   * the portfolio base currency when the portfolio holds nothing yet.
   * Multi-currency without consolidated totals → null (fail-closed).
   */
  private async resolvePlanCurrency(portfolioId: string, userId?: string): Promise<string | null> {
    const allocation = await this.allocation.execute({ portfolioId, userId: userId ?? '' });
    const translated = allocation.translatedAllocation;
    if (translated && translated.status === 'AVAILABLE') {
      return translated.reportingCurrency;
    }
    const buckets = Object.values(allocation.currencies);
    if (buckets.length === 1 && buckets[0]) {
      return buckets[0].currency;
    }
    if (buckets.length === 0) {
      const portfolio = await this.verifyOwnership(portfolioId, userId);
      const baseCurrency = (portfolio as { baseCurrency?: unknown }).baseCurrency;
      return typeof baseCurrency === 'string' && baseCurrency !== '' ? baseCurrency : null;
    }
    return null;
  }

  private parseAndValidateItems(
    rawItems: Array<{ category: string; amount: string }>,
  ): Array<{ category: string; amount: string }> {
    const canonical: Array<{ category: string; amount: string }> = [];
    for (const item of rawItems ?? []) {
      const amount =
        typeof item?.amount === 'string' ? parseScenarioAmountToCanonical(item.amount) : null;
      if (amount === null) {
        throw new InvalidContributionPlanError('Invalid plan: INVALID_AMOUNT');
      }
      canonical.push({ category: item.category, amount });
    }
    return canonical;
  }

  async createPlan(command: {
    portfolioId: string;
    userId?: string;
    name: unknown;
    plannedDate: unknown;
    items: Array<{ category: string; amount: string }>;
    sourceScenarioId?: string | null;
    today?: string;
  }): Promise<ContributionPlanView> {
    await this.verifyOwnership(command.portfolioId, command.userId);
    const items = this.parseAndValidateItems(command.items);
    const validation = validatePlanInput({
      name: command.name,
      plannedDate: command.plannedDate,
      items,
      today: command.today ?? todayCivilString(),
      allowPastDate: false,
    });
    if (!validation.valid) {
      throw new InvalidContributionPlanError(
        `Invalid plan: ${validation.errors.map((error) => error.code).join(',')}`,
      );
    }
    let sourceScenarioId: string | null = null;
    if (command.sourceScenarioId !== undefined && command.sourceScenarioId !== null) {
      const scenario = await this.scenarios.findByIdAndPortfolio(
        command.sourceScenarioId,
        command.portfolioId,
      );
      if (!scenario) {
        throw new EntityNotFoundError('AllocationScenario', command.sourceScenarioId);
      }
      sourceScenarioId = scenario.id;
    }
    const active = await this.plans.countActiveByPortfolio(command.portfolioId);
    if (active >= MAX_ACTIVE_CONTRIBUTION_PLANS_PER_PORTFOLIO) {
      throw new InvalidContributionPlanError(
        'Você atingiu o limite de planos ativos nesta carteira.',
      );
    }
    const currency = await this.resolvePlanCurrency(command.portfolioId, command.userId);
    if (!currency) {
      throw new InvalidContributionPlanError(
        'Não foi possível determinar uma moeda consolidada para este plano.',
      );
    }
    const created = await this.plans.create(command.portfolioId, {
      name: validation.name,
      plannedDate: validation.plannedDate,
      currency,
      sourceScenarioId,
      items,
    });
    return this.toView(created);
  }

  async listPlans(
    portfolioId: string,
    userId?: string,
  ): Promise<{
    upcoming: ContributionPlanView[];
    history: ContributionPlanView[];
    activeLimit: number;
  }> {
    await this.verifyOwnership(portfolioId, userId);
    const [upcoming, completed, cancelled] = await Promise.all([
      this.plans.listByPortfolio(portfolioId, 'PLANNED'),
      this.plans.listByPortfolio(portfolioId, 'COMPLETED'),
      this.plans.listByPortfolio(portfolioId, 'CANCELLED'),
    ]);
    return {
      upcoming: upcoming.map((row) => this.toView(row)),
      history: [...completed, ...cancelled]
        .sort((left, right) =>
          left.plannedDate === right.plannedDate
            ? left.id.localeCompare(right.id)
            : left.plannedDate > right.plannedDate
              ? -1
              : 1,
        )
        .map((row) => this.toView(row)),
      activeLimit: MAX_ACTIVE_CONTRIBUTION_PLANS_PER_PORTFOLIO,
    };
  }

  async getNextPlanned(
    portfolioId: string,
    userId?: string,
  ): Promise<{ plan: ContributionPlanView | null }> {
    await this.verifyOwnership(portfolioId, userId);
    const row = await this.plans.findNextPlanned(portfolioId);
    return { plan: row ? this.toView(row) : null };
  }

  private async loadScoped(planId: string, portfolioId: string, userId?: string) {
    await this.verifyOwnership(portfolioId, userId);
    const row = await this.plans.findByIdAndPortfolio(planId, portfolioId);
    if (!row) {
      throw new EntityNotFoundError('ContributionPlan', planId);
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

  async getPlanDetail(command: { planId: string; portfolioId: string; userId?: string }): Promise<{
    plan: ContributionPlanView;
    live: ScenarioLiveResultView | null;
    limitations: string[];
  }> {
    const row = await this.loadScoped(command.planId, command.portfolioId, command.userId);
    const plan = this.toView(row);
    const stillValid = validateScenarioInput({
      type: 'CONTRIBUTION',
      changes: row.items.map((item) => ({ category: item.category, amount: item.amount })),
    });
    if (!stillValid.valid) {
      return { plan, live: null, limitations: ['NEEDS_REVIEW'] };
    }
    const simulated = await this.strategies.simulateMany({
      portfolioId: command.portfolioId,
      userId: command.userId,
      changesList: [row.items.map((item) => ({ category: item.category, amount: item.amount }))],
    });
    if (simulated.reason === 'NO_STRATEGY' || !simulated.strategy) {
      return { plan, live: null, limitations: ['NO_STRATEGY'] };
    }
    const result = simulated.results[0];
    if (simulated.reason !== 'OK' || !result || !simulated.currency) {
      return { plan, live: null, limitations: ['INSUFFICIENT_DATA'] };
    }
    if (plan.currency !== simulated.currency) {
      return { plan, live: null, limitations: ['CURRENCY_MISMATCH'] };
    }
    const limitations = simulated.qualified ? ['PARTIAL_COVERAGE'] : [];
    return {
      plan,
      live: {
        ...this.toLiveView(result, simulated.qualified, simulated.denominator, simulated.asOf),
      },
      limitations,
    };
  }

  async updatePlan(command: {
    planId: string;
    portfolioId: string;
    userId?: string;
    name: unknown;
    plannedDate: unknown;
    items: Array<{ category: string; amount: string }>;
    today?: string;
  }): Promise<ContributionPlanView> {
    const existing = await this.loadScoped(command.planId, command.portfolioId, command.userId);
    if (existing.status !== 'PLANNED') {
      throw new InvalidContributionPlanError(
        'Only PLANNED plans can be edited: COMPLETED and CANCELLED history stays immutable',
      );
    }
    const items = this.parseAndValidateItems(command.items);
    const validation = validatePlanInput({
      name: command.name,
      plannedDate: command.plannedDate,
      items,
      today: command.today ?? todayCivilString(),
      // An existing plan may already sit past its date; editing must stay possible.
      allowPastDate: true,
    });
    if (!validation.valid) {
      throw new InvalidContributionPlanError(
        `Invalid plan: ${validation.errors.map((error) => error.code).join(',')}`,
      );
    }
    const currency = await this.resolvePlanCurrency(command.portfolioId, command.userId);
    if (!currency) {
      throw new InvalidContributionPlanError(
        'Não foi possível determinar uma moeda consolidada para este plano.',
      );
    }
    const replaced = await this.plans.replace(command.planId, command.portfolioId, {
      name: validation.name,
      plannedDate: validation.plannedDate,
      currency,
      sourceScenarioId: existing.sourceScenarioId,
      items,
    });
    if (!replaced) {
      throw new EntityNotFoundError('ContributionPlan', command.planId);
    }
    return this.toView(replaced);
  }

  private async transitionPlan(command: {
    planId: string;
    portfolioId: string;
    userId?: string;
    to: 'COMPLETED' | 'CANCELLED';
  }): Promise<ContributionPlanView> {
    const existing = await this.loadScoped(command.planId, command.portfolioId, command.userId);
    if (!canTransitionPlanStatus(existing.status, command.to)) {
      throw new InvalidContributionPlanError(
        `Invalid plan transition: ${existing.status} cannot move to ${command.to}`,
      );
    }
    // Guarded single write: concurrent transitions converge on a single outcome.
    const moved = await this.plans.setStatus(command.planId, command.portfolioId, command.to);
    if (!moved) {
      throw new InvalidContributionPlanError(
        `Plan is no longer PLANNED and cannot move to ${command.to}`,
      );
    }
    return this.toView(moved);
  }

  async completePlan(command: {
    planId: string;
    portfolioId: string;
    userId?: string;
  }): Promise<ContributionPlanView> {
    // Status flip only: no transaction, order or ledger write happens here.
    return this.transitionPlan({ ...command, to: 'COMPLETED' });
  }

  async cancelPlan(command: {
    planId: string;
    portfolioId: string;
    userId?: string;
  }): Promise<ContributionPlanView> {
    return this.transitionPlan({ ...command, to: 'CANCELLED' });
  }

  async deletePlan(command: {
    planId: string;
    portfolioId: string;
    userId?: string;
  }): Promise<void> {
    const existing = await this.loadScoped(command.planId, command.portfolioId, command.userId);
    if (existing.status !== 'PLANNED') {
      throw new InvalidContributionPlanError(
        'Only PLANNED plans can be deleted: use cancel to preserve history',
      );
    }
    const removed = await this.plans.remove(command.planId, command.portfolioId);
    if (!removed) {
      throw new EntityNotFoundError('ContributionPlan', command.planId);
    }
  }

  /**
   * Classifies ledger transactions into plan categories for actuals.
   * DEPOSIT (no asset) is cash by definition; asset-backed rows use the
   * canonical asset type when it is a known category, else OTHER.
   * Nothing is invented: unmapped rows stay visible as OTHER.
   */
  private async classifyTransactions(
    transactions: Array<{ id: string; assetId?: string | null; type: string }>,
  ): Promise<Map<string, string>> {
    const categories = new Map<string, string>();
    const assetIds = Array.from(
      new Set(
        transactions
          .filter((tx) => tx.type !== 'DEPOSIT' && tx.assetId !== undefined && tx.assetId !== null)
          .map((tx) => tx.assetId as string),
      ),
    );
    const assets = assetIds.length > 0 ? await this.assets.findByIds(assetIds) : [];
    const typeByAssetId = new Map<string, string>(assets.map((asset) => [asset.id, asset.type]));
    for (const tx of transactions) {
      if (tx.type === 'DEPOSIT') {
        categories.set(tx.id, 'CASH');
        continue;
      }
      const assetType =
        tx.assetId !== undefined && tx.assetId !== null ? typeByAssetId.get(tx.assetId) : undefined;
      categories.set(
        tx.id,
        assetType !== undefined && (STRATEGY_CATEGORIES as readonly string[]).includes(assetType)
          ? assetType
          : 'OTHER',
      );
    }
    return categories;
  }

  private transactionAmount(
    tx: unknown,
  ): { amount: string; currency: string; tradeDate: string } | null {
    const candidate = tx as {
      amount?: { amount?: string };
      currency?: string;
      tradeDate?: { toString(): string };
    };
    const amount = candidate.amount?.amount;
    if (typeof amount !== 'string' || typeof candidate.currency !== 'string') return null;
    const tradeDate = candidate.tradeDate?.toString();
    if (typeof tradeDate !== 'string') return null;
    return { amount, currency: candidate.currency, tradeDate };
  }

  /**
   * Phase 5Q-G — planned vs actual tracking (read-only aggregation).
   * Confirmed links only feed the totals; candidates are derived on read
   * (never persisted, never counted). Cancelled plans show confirmed
   * history without new candidates.
   */
  async getPlanTracking(command: {
    planId: string;
    portfolioId: string;
    userId?: string;
  }): Promise<{
    plan: ContributionPlanView;
    tracking: ContributionTracking;
    confirmed: Array<{
      transactionId: string;
      type: string;
      tradeDate: string;
      amount: string;
      currency: string;
      category: string;
    }>;
    candidates: Array<TrackingCandidate & { type: string; category: string }>;
    limitations: string[];
  }> {
    const row = await this.loadScoped(command.planId, command.portfolioId, command.userId);
    const plan = this.toView(row);
    const links = await this.links.listByPlan(row.id);
    const confirmedIds = new Set(
      links.filter((link) => link.status === 'CONFIRMED').map((link) => link.transactionId),
    );
    const rejectedIds = new Set(
      links.filter((link) => link.status === 'REJECTED').map((link) => link.transactionId),
    );
    const confirmedTxs = await this.transactions.findByIds([...confirmedIds]);
    const confirmedById = new Map<string, Transaction>(confirmedTxs.map((tx) => [tx.id, tx]));
    const categories = await this.classifyTransactions(
      confirmedTxs.map((tx) => ({
        id: tx.id,
        assetId: (tx as { assetId?: string | null }).assetId ?? null,
        type: tx.type,
      })),
    );
    const actual = [...confirmedIds].flatMap((id) => {
      const tx = confirmedById.get(id);
      const parsed = tx ? this.transactionAmount(tx) : null;
      // A confirmed link whose transaction vanished or lost its amount
      // stays visible as a count but contributes no invented money.
      if (!tx || !parsed) return [];
      return [
        {
          transactionId: id,
          type: tx.type,
          tradeDate: parsed.tradeDate,
          amount: parsed.amount,
          currency: parsed.currency,
          category: categories.get(id) ?? 'OTHER',
        },
      ];
    });
    const planned = new Map(row.items.map((item) => [item.category, item.amount]));
    const tracking = deriveContributionTracking({ planned, actual });
    let candidates: Array<TrackingCandidate & { type: string; category: string }> = [];
    if (row.status !== 'CANCELLED') {
      const window = trackingCandidateWindow(row.plannedDate);
      const pool = await this.transactions.findByPortfolioId(
        command.portfolioId,
        {
          type: 'DEPOSIT',
          startDate: LocalDate.from(window.start),
          endDate: LocalDate.from(window.end),
        },
        { limit: 200 },
      );
      const inScope = pool.filter((tx) => tx.portfolioId === command.portfolioId);
      const derived = deriveContributionCandidates({
        plannedDate: row.plannedDate,
        plannedTotal: plan.total,
        currency: row.currency,
        transactions: inScope.flatMap((tx) => {
          const parsed = this.transactionAmount(tx);
          if (!parsed) return [];
          return [
            {
              id: tx.id,
              type: tx.type,
              tradeDate: parsed.tradeDate,
              amount: parsed.amount,
              currency: parsed.currency,
            },
          ];
        }),
        confirmedIds,
        rejectedIds,
      });
      const candidateCategories = await this.classifyTransactions(
        derived.map((candidate) => {
          const tx = inScope.find((item) => item.id === candidate.transactionId);
          return {
            id: candidate.transactionId,
            assetId: (tx as { assetId?: string | null } | undefined)?.assetId ?? null,
            type: 'DEPOSIT',
          };
        }),
      );
      candidates = derived.map((candidate) => ({
        ...candidate,
        type: 'DEPOSIT',
        category: candidateCategories.get(candidate.transactionId) ?? 'CASH',
      }));
    }
    const limitations: string[] = [];
    if (row.status === 'CANCELLED') limitations.push('PLAN_CANCELLED');
    return { plan, tracking, confirmed: actual, candidates, limitations };
  }

  private async loadScopedTransaction(transactionId: string, portfolioId: string, userId?: string) {
    await this.verifyOwnership(portfolioId, userId);
    const tx = await this.transactions.findById(transactionId);
    if (!tx || tx.portfolioId !== portfolioId) {
      throw new EntityNotFoundError('Transaction', transactionId);
    }
    return tx;
  }

  private assertEligibleActual(
    tx: { type: string; currency: string },
    planCurrency: string,
    transactionId: string,
  ): void {
    if (!(ELIGIBLE_CONTRIBUTION_TRANSACTION_TYPES as readonly string[]).includes(tx.type)) {
      throw new InvalidContributionTrackingError(
        `Transaction ${transactionId} of type ${tx.type} cannot confirm a contribution plan`,
      );
    }
    if (tx.currency !== planCurrency) {
      throw new InvalidContributionTrackingError(
        `Transaction currency ${tx.currency} does not match plan currency ${planCurrency}`,
      );
    }
  }

  /**
   * Confirms a ledger transaction as plan actual. Idempotent for the same
   * link; moves REJECTED back to CONFIRMED on explicit re-confirm; refuses
   * transactions already confirmed to another plan (single actual owner).
   * Never creates or mutates a transaction; never touches plan status.
   */
  async confirmPlanLink(command: {
    planId: string;
    portfolioId: string;
    userId?: string;
    transactionId: string;
  }): Promise<{ transactionId: string; status: string }> {
    const row = await this.loadScoped(command.planId, command.portfolioId, command.userId);
    if (row.status === 'CANCELLED') {
      throw new InvalidContributionPlanError('Cancelled plans are read-only');
    }
    const tx = await this.loadScopedTransaction(
      command.transactionId,
      command.portfolioId,
      command.userId,
    );
    this.assertEligibleActual(tx, row.currency, command.transactionId);
    const elsewhere = await this.links.findConfirmedByTransaction(command.transactionId);
    if (elsewhere && elsewhere.planId !== row.id) {
      throw new InvalidContributionTrackingError(
        'Transaction is already confirmed to another contribution plan',
      );
    }
    const link = await this.links.confirm(row.id, command.transactionId);
    return { transactionId: link.transactionId, status: link.status };
  }

  /**
   * Rejects a candidate (memory so it never reappears). Idempotent.
   */
  async rejectPlanLink(command: {
    planId: string;
    portfolioId: string;
    userId?: string;
    transactionId: string;
  }): Promise<{ transactionId: string; status: string }> {
    const row = await this.loadScoped(command.planId, command.portfolioId, command.userId);
    if (row.status === 'CANCELLED') {
      throw new InvalidContributionPlanError('Cancelled plans are read-only');
    }
    await this.loadScopedTransaction(command.transactionId, command.portfolioId, command.userId);
    const link = await this.links.reject(row.id, command.transactionId);
    return { transactionId: link.transactionId, status: link.status };
  }

  /**
   * Unlinks a confirmed transaction (CONFIRMED → REJECTED, audit kept).
   * Already-rejected is a no-op success; absent is 404.
   */
  async unlinkPlanLink(command: {
    planId: string;
    portfolioId: string;
    userId?: string;
    transactionId: string;
  }): Promise<{ transactionId: string; status: string }> {
    const row = await this.loadScoped(command.planId, command.portfolioId, command.userId);
    if (row.status === 'CANCELLED') {
      throw new InvalidContributionPlanError('Cancelled plans are read-only');
    }
    await this.loadScopedTransaction(command.transactionId, command.portfolioId, command.userId);
    const link = await this.links.unlink(row.id, command.transactionId);
    if (!link) {
      throw new EntityNotFoundError('ContributionPlanLink', command.transactionId);
    }
    return { transactionId: link.transactionId, status: link.status };
  }
}
