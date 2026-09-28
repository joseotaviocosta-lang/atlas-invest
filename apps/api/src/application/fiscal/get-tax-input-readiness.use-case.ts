import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { IAssetRepository, IPortfolioRepository, ITransactionRepository } from '@atlas/database';
import type { Transaction } from '@atlas/domain';
import {
  evaluateTaxInputReadiness,
  fiscalCompetenceRange,
  parseFiscalCompetence,
  projectFiscalEvents,
  type FiscalEvent,
} from '@atlas/tax-engine';
import {
  ASSET_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import { TAX_INPUT_PROVIDER } from './tokens';
import type { TaxInputProvider } from './tax-input-provider';
import {
  mapTaxInputReadinessToReadModel,
  type TaxInputReadinessReadModel,
} from './tax-input-readiness.read-model';

/**
 * Reports whether the canonical tax inputs required for later verified rules
 * are available for a competence. Read-only; performs NO tax calculation and
 * NEVER estimates missing values (ADR-252).
 */
@Injectable()
export class GetTaxInputReadinessUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(TAX_INPUT_PROVIDER)
    private readonly taxInputProvider: TaxInputProvider,
  ) {}

  async execute(params: {
    userId: string;
    competence: string;
  }): Promise<TaxInputReadinessReadModel> {
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
      transactions.push(
        ...(await this.transactionRepository.findByPortfolioId(String(portfolio.id))),
      );
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

    const events = projectFiscalEvents(transactions, { assetTypeByAssetId }).filter(
      (event: FiscalEvent) => event.competence.value === competence.value,
    );

    const saleTransactionIds = events
      .filter((event) => event.eventType === 'SALE')
      .map((event) => event.sourceTransactionId);
    const requiresWithholding = events.some(
      (event) => event.eventType === 'SALE' || event.eventType === 'INCOME',
    );
    const fiiAssetIds = [
      ...new Set(
        events
          .filter((event) => event.taxAssetCategory === 'FII' && event.assetId)
          .map((event) => event.assetId!),
      ),
    ];
    const asOf = fiscalCompetenceRange(competence).end;

    const [tradeClassifications, withholdingInputs, fiiFacts] = await Promise.all([
      this.taxInputProvider.getTradeClassifications(params.userId, competence.value),
      this.taxInputProvider.getWithholdingInputs(params.userId, competence.value),
      fiiAssetIds.length > 0
        ? this.taxInputProvider.getFiiEligibilityFacts(params.userId, fiiAssetIds, asOf.toString())
        : Promise.resolve([]),
    ]);

    const readiness = evaluateTaxInputReadiness({
      competence,
      requiredTradeClassificationTransactionIds: saleTransactionIds,
      tradeClassifications,
      requiresWithholding,
      withholdingInputs,
      requiresFiiMetadata: fiiAssetIds.length > 0,
      fiiFacts,
      asOfDate: asOf,
      fiiStalenessDays: 90,
    });

    return mapTaxInputReadinessToReadModel(readiness);
  }
}
