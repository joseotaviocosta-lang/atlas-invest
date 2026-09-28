import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { IAssetRepository, IPortfolioRepository, ITransactionRepository } from '@atlas/database';
import type { Transaction } from '@atlas/domain';
import {
  buildMonthlyTaxState,
  parseFiscalCompetence,
  projectFiscalEvents,
} from '@atlas/tax-engine';
import {
  ASSET_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { FISCAL_RULE_REGISTRY } from './fiscal-rule-registry';
import {
  mapMonthlyTaxStateToReadModel,
  type MonthlyTaxStateReadModel,
} from './monthly-tax-state.read-model';

/**
 * Builds the deterministic Monthly Tax State for the authenticated tax subject
 * (the user), aggregating canonical immutable transactions across every
 * portfolio they own. Fiscal truth derives exclusively from the ledger — never
 * from UI state, AI output or cached totals (ADR-236).
 */
@Injectable()
export class GetMonthlyTaxStateUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
  ) {}

  async execute(params: { userId: string; competence: string }): Promise<MonthlyTaxStateReadModel> {
    const competence = parseFiscalCompetence(params.competence);
    if (!competence) {
      throw new BadRequestException({
        message: `Invalid fiscal competence '${params.competence}'. Expected canonical 'YYYY-MM'`,
        code: 'FISCAL.INVALID_COMPETENCE',
      });
    }

    const portfolios = await this.portfolioRepository.findByUserId(params.userId);

    const transactions: Transaction[] = [];
    for (const portfolio of portfolios) {
      const ledger = await this.transactionRepository.findByPortfolioId(String(portfolio.id));
      transactions.push(...ledger);
    }

    // Batch asset classification metadata by distinct assetId (no per-event N+1).
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

    const events = projectFiscalEvents(transactions, { assetTypeByAssetId });
    const state = buildMonthlyTaxState({
      competence,
      events,
      ruleSets: FISCAL_RULE_REGISTRY,
      taxSubjectId: params.userId,
    });

    return mapMonthlyTaxStateToReadModel(state);
  }
}
