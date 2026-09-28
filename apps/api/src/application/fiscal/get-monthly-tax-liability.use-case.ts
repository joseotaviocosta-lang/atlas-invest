import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { IAssetRepository, IPortfolioRepository, ITransactionRepository } from '@atlas/database';
import type { Transaction } from '@atlas/domain';
import { replayPortfolio } from '@atlas/portfolio-engine';
import {
  parseFiscalCompetence,
  projectFiscalEvents,
  replayMonthlyTaxLiability,
  type CanonicalRealizedResult,
  type FiscalEvent,
  type TaxRuleSet,
} from '@atlas/tax-engine';
import {
  ASSET_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { TAX_RULE_REGISTRY } from './tokens';
import {
  mapMonthlyTaxLiabilityToReadModel,
  type MonthlyTaxLiabilityReadModel,
} from './monthly-tax-liability.read-model';

function currentCompetence(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`;
}

/**
 * Builds the deterministic MonthlyTaxLiability for the authenticated tax
 * subject by replaying every competence from ledger inception up to the
 * requested month, carrying category-isolated loss balances. All tax arithmetic
 * happens inside @atlas/tax-engine (ADR-242, ADR-240).
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
    @Inject(TAX_RULE_REGISTRY)
    private readonly ruleRegistry: readonly TaxRuleSet[],
  ) {}

  async execute(params: {
    userId: string;
    competence: string;
  }): Promise<MonthlyTaxLiabilityReadModel> {
    const competence = parseFiscalCompetence(params.competence);
    if (!competence) {
      throw new BadRequestException({
        message: `Invalid fiscal competence '${params.competence}'. Expected canonical 'YYYY-MM'`,
        code: 'FISCAL.INVALID_COMPETENCE',
      });
    }

    const portfolios = await this.portfolioRepository.findByUserId(params.userId);
    const transactions: Transaction[] = [];
    const canonicalRealizedByTransactionId = new Map<string, CanonicalRealizedResult>();
    for (const portfolio of portfolios) {
      const ledger = await this.transactionRepository.findByPortfolioId(String(portfolio.id));
      transactions.push(...ledger);
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

    const events = projectFiscalEvents(transactions, {
      assetTypeByAssetId,
      canonicalRealizedByTransactionId,
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
      taxSubjectId: params.userId,
    });

    const requested =
      results.find((r) => r.competence.value === competence.value) ?? results[results.length - 1];
    if (!requested) {
      // Defensive: ordered always contains the requested competence.
      throw new BadRequestException({
        message: `Invalid fiscal competence '${params.competence}'.`,
        code: 'FISCAL.INVALID_COMPETENCE',
      });
    }

    const inProgress = competence.value >= currentCompetence();
    const readModel = mapMonthlyTaxLiabilityToReadModel(requested);
    return inProgress && !readModel.limitations.includes('IN_PROGRESS')
      ? { ...readModel, limitations: [...readModel.limitations, 'IN_PROGRESS'] }
      : readModel;
  }
}
