import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import {
  IAccountRepository,
  IAssetRepository,
  IPortfolioRepository,
  ITaxCompensationElectionRepository,
  ITransactionRepository,
} from '@atlas/database';
import type { Transaction } from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';
import {
  parseFiscalCompetence,
  projectFiscalEvents,
  replayMonthlyTaxLiability,
  type CanonicalRealizedResult,
  type FiscalEvent,
  type MonthlyTaxLiability,
  type TaxCompensationElectionValue,
  type TaxRuleSet,
  type TaxWithholdingCredit,
} from '@atlas/tax-engine';
import {
  ACCOUNT_REPOSITORY,
  ASSET_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TAX_COMPENSATION_ELECTION_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { TAX_INPUT_PROVIDER, TAX_RULE_REGISTRY } from './tokens';
import type { TaxInputProvider } from './tax-input-provider';
import {
  mapMonthlyTaxLiabilityToReadModel,
  type MonthlyTaxLiabilityReadModel,
} from './monthly-tax-liability.read-model';
import { EQUITY_EXEMPT_LOSS_ELECTION_TYPE } from './tax-compensation-election.read-model';
import {
  computeEquityMonthlyFiscalRead,
  type EquityElectionSnapshot,
  type EquityMonthlyFiscalReadModel,
} from './equity-monthly-fiscal-replay.service';

function currentCompetence(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`;
}

interface FiscalContext {
  readonly transactions: Transaction[];
  readonly canonicalRealizedByTransactionId: Map<string, CanonicalRealizedResult>;
  readonly assetTypeByAssetId: Map<string, string>;
  readonly institutionByAccountId: Map<string, string>;
}

/**
 * Builds the deterministic MonthlyTaxLiability for the authenticated tax
 * subject by replaying every competence from ledger inception up to the
 * requested month, carrying category-isolated loss balances. All tax arithmetic
 * happens inside @atlas/tax-engine (ADR-242, ADR-240). Also attaches the
 * additive equity monthly fiscal read (Phase 4G.2A.1b.1) computed from the real
 * ledger and persisted elections.
 */
@Injectable()
export class GetMonthlyTaxLiabilityUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(TAX_COMPENSATION_ELECTION_REPOSITORY)
    private readonly electionRepository: ITaxCompensationElectionRepository,
    @Inject(TAX_RULE_REGISTRY)
    private readonly ruleRegistry: readonly TaxRuleSet[],
    @Inject(TAX_INPUT_PROVIDER)
    private readonly taxInputProvider: TaxInputProvider,
  ) {}

  async execute(params: {
    userId: string;
    competence: string;
  }): Promise<MonthlyTaxLiabilityReadModel & { equity: EquityMonthlyFiscalReadModel }> {
    const context = await this.loadContext(params.userId);
    const requested = await this.computeFromContext(context, params.userId, params.competence);
    const competence = requested.competence.value;
    const inProgress = competence >= currentCompetence();
    const readModel = mapMonthlyTaxLiabilityToReadModel(requested);
    const withProgress =
      inProgress && !readModel.limitations.includes('IN_PROGRESS')
        ? { ...readModel, limitations: [...readModel.limitations, 'IN_PROGRESS'] }
        : readModel;
    const equity = await this.computeEquity(context, params.userId, competence);
    return { ...withProgress, equity };
  }

  /**
   * Computes the canonical domain MonthlyTaxLiability (Phase 4C.2 consumes this
   * to materialize operational tax obligations without recalculating tax).
   */
  async compute(params: { userId: string; competence: string }): Promise<MonthlyTaxLiability> {
    const context = await this.loadContext(params.userId);
    return this.computeFromContext(context, params.userId, params.competence);
  }

  private async loadContext(userId: string): Promise<FiscalContext> {
    const portfolios = await this.portfolioRepository.findByUserId(userId);
    const transactions: Transaction[] = [];
    const canonicalRealizedByTransactionId = new Map<string, CanonicalRealizedResult>();
    const institutionByAccountId = new Map<string, string>();
    for (const portfolio of portfolios) {
      const ledger = await this.transactionRepository.findByPortfolioId(String(portfolio.id));
      transactions.push(...ledger);
      const accounts = await this.accountRepository.findByPortfolioId(String(portfolio.id));
      for (const account of accounts) {
        institutionByAccountId.set(String(account.id), String(account.institutionId));
      }
      try {
        const replay = replayPortfolio({ portfolioId: String(portfolio.id), transactions: ledger });
        for (const disposal of replay.state.realizedDisposals) {
          if (disposal.status === 'KNOWN' && disposal.realizedGainLoss) {
            canonicalRealizedByTransactionId.set(String(disposal.transactionId), {
              netProceeds: disposal.netProceeds.amount,
              ...(disposal.costBasisRemoved
                ? { costBasisRemoved: disposal.costBasisRemoved.amount }
                : {}),
              realizedGainLoss: disposal.realizedGainLoss.amount,
              status: 'KNOWN',
            });
          } else {
            canonicalRealizedByTransactionId.set(String(disposal.transactionId), {
              status: 'INCOMPLETE',
            });
          }
        }
      } catch {
        // An inconsistent ledger fails closed downstream via MISSING canonical data.
      }
    }

    const assetIds = new Set<string>();
    for (const tx of transactions) {
      const assetId = (tx as { assetId?: unknown }).assetId;
      if (assetId) assetIds.add(String(assetId));
    }
    const assetTypeByAssetId = new Map<string, string>();
    for (const assetId of assetIds) {
      const asset = await this.assetRepository.findById(assetId);
      if (asset) assetTypeByAssetId.set(assetId, asset.type);
    }

    return {
      transactions,
      canonicalRealizedByTransactionId,
      assetTypeByAssetId,
      institutionByAccountId,
    };
  }

  private async computeFromContext(
    context: FiscalContext,
    userId: string,
    rawCompetence: string,
  ): Promise<MonthlyTaxLiability> {
    const competence = parseFiscalCompetence(rawCompetence);
    if (!competence) {
      throw new BadRequestException({
        message: `Invalid fiscal competence '${rawCompetence}'. Expected canonical 'YYYY-MM'`,
        code: 'FISCAL.INVALID_COMPETENCE',
      });
    }

    const events = projectFiscalEvents(context.transactions, {
      assetTypeByAssetId: context.assetTypeByAssetId,
      canonicalRealizedByTransactionId: context.canonicalRealizedByTransactionId,
    });
    const byCompetence = new Map<string, FiscalEvent[]>();
    for (const event of events) {
      const list = byCompetence.get(event.competence.value) ?? [];
      list.push(event);
      byCompetence.set(event.competence.value, list);
    }

    // Replay only competences up to (and including) the requested one, plus the
    // requested competence itself even when it has no events.
    const competences = new Set<string>([competence.value]);
    for (const key of byCompetence.keys()) {
      if (key <= competence.value) competences.add(key);
    }
    const ordered = [...competences].sort();

    const results = replayMonthlyTaxLiability({
      months: ordered.map((value) => ({
        competence: value,
        events: byCompetence.get(value) ?? [],
      })),
      ruleSets: this.ruleRegistry,
      taxSubjectId: userId,
      withholdingCreditsByCompetence: await this.buildWithholdingCredits(userId, competence.value),
    });

    const requested =
      results.find((r) => r.competence.value === competence.value) ?? results[results.length - 1];
    if (!requested) {
      throw new BadRequestException({
        message: `Invalid fiscal competence '${rawCompetence}'.`,
        code: 'FISCAL.INVALID_COMPETENCE',
      });
    }

    return requested;
  }

  private async buildWithholdingCredits(
    userId: string,
    competence: string,
  ): Promise<Record<string, TaxWithholdingCredit[]>> {
    const withholdingInputs = await this.taxInputProvider.getWithholdingInputs(userId, competence);
    const withholdingCreditsByCompetence: Record<string, TaxWithholdingCredit[]> = {};
    for (const input of withholdingInputs) {
      if (input.status !== 'CONFIRMED' || !input.amount) continue;
      const key = input.competence.value;
      const list = withholdingCreditsByCompetence[key] ?? [];
      list.push({
        category: input.category,
        currency: input.currency,
        amount: input.amount,
        source: 'FISCAL_EVENT',
        ...(input.id ? { sourceEventId: input.id } : {}),
      });
      withholdingCreditsByCompetence[key] = list;
    }
    return withholdingCreditsByCompetence;
  }

  private async computeEquity(
    context: FiscalContext,
    userId: string,
    competence: string,
  ): Promise<EquityMonthlyFiscalReadModel> {
    const rows = await this.electionRepository.listCurrentBySubject({
      taxSubjectId: userId,
      electionType: EQUITY_EXEMPT_LOSS_ELECTION_TYPE,
    });
    const electionByCompetence = new Map<string, EquityElectionSnapshot>();
    for (const row of rows) {
      electionByCompetence.set(row.competence, {
        value: row.value as TaxCompensationElectionValue,
        version: row.version,
        fingerprint: row.fingerprint,
      });
    }
    return computeEquityMonthlyFiscalRead({
      taxSubjectId: userId,
      requestedCompetence: competence,
      transactions: context.transactions,
      assetTypeByAssetId: context.assetTypeByAssetId,
      institutionByAccountId: context.institutionByAccountId,
      canonicalRealizedByTransactionId: context.canonicalRealizedByTransactionId,
      electionByCompetence,
    });
  }
}
