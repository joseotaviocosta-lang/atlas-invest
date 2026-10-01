import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  IAnnualOpeningPositionRepository,
  IAssetRepository,
  IPortfolioRepository,
  ITransactionRepository,
} from '@atlas/database';
import {
  AssetId,
  createAccountId,
  createAssetId,
  Currency,
  LocalDate,
  Money,
  Quantity,
} from '@atlas/domain';
import {
  AnnualOpeningPositionInput,
  buildAnnualPositionReport,
  createAnnualOpeningPosition,
  createCalendarYear,
  createTaxSubjectId,
  isValidCalendarYear,
  OpeningPositionSource,
  OpeningPositionStatus,
  resolveTaxAssetCategory,
} from '@atlas/tax-engine';
import {
  ANNUAL_OPENING_POSITION_REPOSITORY,
  ASSET_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import {
  AnnualPositionReportReadModel,
  mapAnnualPositionReportToReadModel,
} from './annual-position.read-model';

export interface GetAnnualPositionReportQuery {
  readonly taxSubjectId: string;
  readonly portfolioId: string;
  readonly calendarYear: number;
}

@Injectable()
export class GetAnnualPositionReportUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
    @Inject(ANNUAL_OPENING_POSITION_REPOSITORY)
    private readonly openingPositionRepository: IAnnualOpeningPositionRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
  ) {}

  async execute(query: GetAnnualPositionReportQuery): Promise<AnnualPositionReportReadModel> {
    if (!isValidCalendarYear(query.calendarYear)) {
      throw new BadRequestException(
        `Invalid calendar year: ${query.calendarYear}. Must be an integer between 1900 and 2100.`,
      );
    }

    // Anti-enumeration: 404 if portfolio does not belong to user
    const portfolio = await this.portfolioRepository.findByIdAndUserId(
      query.portfolioId,
      query.taxSubjectId,
    );
    if (!portfolio) {
      throw new NotFoundException(`Portfolio ${query.portfolioId} not found.`);
    }

    // Load ledger transactions for the portfolio
    const transactions = await this.transactionRepository.findByPortfolioId(query.portfolioId);

    // Load persisted opening positions
    const openingRows = await this.openingPositionRepository.listByPortfolio({
      taxSubjectId: query.taxSubjectId,
      portfolioId: query.portfolioId,
    });

    const openingPositions: AnnualOpeningPositionInput[] = openingRows.map((row) => {
      const year = row.effectiveDate.getUTCFullYear();
      const month = row.effectiveDate.getUTCMonth() + 1;
      const day = row.effectiveDate.getUTCDate();
      return createAnnualOpeningPosition({
        id: row.id,
        taxSubjectId: createTaxSubjectId(row.taxSubjectId),
        portfolioId: portfolio.id,
        accountId: createAccountId(row.accountId),
        assetId: createAssetId(row.assetId),
        effectiveDate: LocalDate.fromParts(year, month, day),
        quantity: Quantity.from(row.quantity),
        totalHistoricalCost: Money.from(row.totalHistoricalCost, row.currency),
        currency: row.currency as Currency,
        source: row.source as OpeningPositionSource,
        status: row.status as OpeningPositionStatus,
        revision: row.revision,
        notes: row.notes ?? undefined,
        supersedesId: row.supersedesId ?? undefined,
        confirmedAt: row.confirmedAt ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    });

    // Collect all asset IDs from transactions and opening positions
    const assetIdSet = new Set<string>();
    for (const tx of transactions) {
      if ('assetId' in tx && tx.assetId) {
        assetIdSet.add(String(tx.assetId));
      }
    }
    for (const op of openingPositions) {
      assetIdSet.add(String(op.assetId));
    }

    const assets = await this.assetRepository.findByIds(Array.from(assetIdSet));
    const assetMap = new Map(assets.map((a) => [String(a.id), a]));

    const report = buildAnnualPositionReport({
      taxSubjectId: createTaxSubjectId(query.taxSubjectId),
      portfolioId: portfolio.id,
      calendarYear: createCalendarYear(query.calendarYear),
      transactions,
      openingPositions,
      assetMetadataResolver: (assetId: AssetId) => {
        const asset = assetMap.get(String(assetId));
        if (!asset) return undefined;
        return {
          ticker: asset.ticker,
          category: resolveTaxAssetCategory(asset.type),
          supported: true,
        };
      },
    });

    return mapAnnualPositionReportToReadModel(report);
  }
}
