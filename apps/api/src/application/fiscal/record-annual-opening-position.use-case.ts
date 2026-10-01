import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  IAccountRepository,
  IAnnualOpeningPositionRepository,
  IAssetRepository,
  IPortfolioRepository,
} from '@atlas/database';
import { Quantity, Money, isValidCurrency } from '@atlas/domain';
import { OPENING_POSITION_SOURCES } from '@atlas/tax-engine';
import {
  ACCOUNT_REPOSITORY,
  ANNUAL_OPENING_POSITION_REPOSITORY,
  ASSET_REPOSITORY,
  PORTFOLIO_REPOSITORY,
} from '../../database/tokens';
import {
  AnnualOpeningPositionReadModel,
  mapAnnualOpeningPositionToReadModel,
} from './annual-opening-position.read-model';

export interface RecordAnnualOpeningPositionCommand {
  readonly taxSubjectId: string;
  readonly portfolioId: string;
  readonly accountId: string;
  readonly assetId: string;
  readonly effectiveDate: string; // YYYY-MM-DD
  readonly quantity: string;
  readonly totalHistoricalCost: string;
  readonly currency: string;
  readonly source: string;
  readonly status?: string;
  readonly notes?: string;
}

export interface RecordAnnualOpeningPositionResult {
  readonly outcome: string;
  readonly position: AnnualOpeningPositionReadModel;
}

@Injectable()
export class RecordAnnualOpeningPositionUseCase {
  constructor(
    @Inject(PORTFOLIO_REPOSITORY)
    private readonly portfolioRepository: IPortfolioRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(ASSET_REPOSITORY)
    private readonly assetRepository: IAssetRepository,
    @Inject(ANNUAL_OPENING_POSITION_REPOSITORY)
    private readonly openingPositionRepository: IAnnualOpeningPositionRepository,
  ) {}

  async execute(
    command: RecordAnnualOpeningPositionCommand,
  ): Promise<RecordAnnualOpeningPositionResult> {
    // 1. Verify portfolio ownership (anti-enumeration 404)
    const portfolio = await this.portfolioRepository.findByIdAndUserId(
      command.portfolioId,
      command.taxSubjectId,
    );
    if (!portfolio) {
      throw new NotFoundException(`Portfolio ${command.portfolioId} not found.`);
    }

    // 2. Verify account belongs to portfolio
    const account = await this.accountRepository.findById(command.accountId);
    if (!account || String(account.portfolioId) !== String(command.portfolioId)) {
      throw new NotFoundException(`Account ${command.accountId} not found in portfolio.`);
    }

    // 3. Verify asset exists
    const asset = await this.assetRepository.findById(command.assetId);
    if (!asset) {
      throw new NotFoundException(`Asset ${command.assetId} not found.`);
    }

    // 4. Validate quantity and cost format
    if (typeof command.quantity !== 'string' || typeof command.totalHistoricalCost !== 'string') {
      throw new BadRequestException('Quantity and totalHistoricalCost must be decimal strings.');
    }

    try {
      const qty = Quantity.from(command.quantity);
      if (qty.isZero() || qty.isNegative()) {
        throw new BadRequestException('Quantity must be strictly positive (> 0).');
      }
    } catch (err) {
      throw new BadRequestException(
        `Invalid quantity: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      const cost = Money.from(command.totalHistoricalCost, command.currency);
      if (cost.isNegative()) {
        throw new BadRequestException('totalHistoricalCost must be non-negative (>= 0).');
      }
    } catch (err) {
      throw new BadRequestException(
        `Invalid totalHistoricalCost: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!isValidCurrency(command.currency)) {
      throw new BadRequestException(`Invalid currency: ${command.currency}`);
    }

    if (
      !OPENING_POSITION_SOURCES.includes(
        command.source as (typeof OPENING_POSITION_SOURCES)[number],
      )
    ) {
      throw new BadRequestException(
        `Invalid source: ${command.source}. Must be one of: ${OPENING_POSITION_SOURCES.join(', ')}`,
      );
    }

    // Validate date format YYYY-MM-DD
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(command.effectiveDate.trim());
    if (!dateMatch) {
      throw new BadRequestException(
        `Invalid effectiveDate: ${command.effectiveDate}. Expected YYYY-MM-DD.`,
      );
    }
    const year = parseInt(dateMatch[1]!, 10);
    const month = parseInt(dateMatch[2]!, 10);
    const day = parseInt(dateMatch[3]!, 10);
    const effectiveDateUtc = new Date(Date.UTC(year, month - 1, day));

    const writeResult = await this.openingPositionRepository.create({
      taxSubjectId: command.taxSubjectId,
      portfolioId: command.portfolioId,
      accountId: command.accountId,
      assetId: command.assetId,
      effectiveDate: effectiveDateUtc,
      quantity: command.quantity,
      totalHistoricalCost: command.totalHistoricalCost,
      currency: command.currency,
      source: command.source,
      status: command.status ?? 'CONFIRMED',
      notes: command.notes,
    });

    return {
      outcome: writeResult.outcome,
      position: mapAnnualOpeningPositionToReadModel(writeResult.record),
    };
  }
}
