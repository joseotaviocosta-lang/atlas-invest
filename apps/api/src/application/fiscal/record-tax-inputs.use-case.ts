import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LocalDate, Money } from '@atlas/domain';
import {
  parseFiscalCompetence,
  validateFiiTaxEligibilityFacts,
  validateTaxTradeClassification,
  validateTaxWithholdingInput,
  type FiiTaxEligibilityFacts,
  type TaxTradeClassification,
  type TaxWithholdingInput,
} from '@atlas/tax-engine';
import {
  IAssetRepository,
  IPortfolioRepository,
  ITaxInputRepository,
  ITransactionRepository,
  type FiiTaxEligibilityRow,
  type TaxTradeClassificationRow,
  type TaxWithholdingRow,
} from '@atlas/database';
import {
  ASSET_REPOSITORY,
  PORTFOLIO_REPOSITORY,
  TAX_INPUT_REPOSITORY,
  TRANSACTION_REPOSITORY,
} from '../../database/tokens';
import {
  fingerprintFiiEligibility,
  fingerprintTradeClassification,
  fingerprintWithholding,
} from './tax-input-fingerprint';

const TRADE_SOURCES = ['BROKER_IMPORT', 'CANONICAL_LEDGER', 'MANUAL_CONFIRMED'] as const;
const TRADE_VALUES = ['NORMAL', 'DAY_TRADE', 'UNKNOWN'] as const;
const WITHHOLDING_STATUSES = ['CONFIRMED', 'UNVERIFIED', 'UNKNOWN'] as const;
const WITHHOLDING_SOURCES = [
  'BROKER_IMPORT',
  'TRANSACTION_METADATA',
  'MANUAL',
  'OTHER_CANONICAL',
] as const;
const FII_STATUSES = ['KNOWN', 'PARTIAL', 'UNKNOWN'] as const;
const FII_SOURCES = [
  'OFFICIAL_FUND_DATA',
  'BROKER_IMPORT',
  'MANUAL_CONFIRMED',
  'OTHER_CANONICAL',
] as const;

function parseCivilDate(value: string): Date {
  try {
    return new Date(`${LocalDate.from(value).toString()}T00:00:00.000Z`);
  } catch {
    throw new BadRequestException({
      message: `Invalid date '${value}'. Expected YYYY-MM-DD`,
      code: 'TAX_INPUT.INVALID_DATE',
    });
  }
}

function badInput(message: string): never {
  throw new BadRequestException({ message, code: 'TAX_INPUT.INVALID_INPUT' });
}

@Injectable()
export class RecordTradeClassificationUseCase {
  constructor(
    @Inject(TAX_INPUT_REPOSITORY) private readonly repository: ITaxInputRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly transactionRepository: ITransactionRepository,
    @Inject(PORTFOLIO_REPOSITORY) private readonly portfolioRepository: IPortfolioRepository,
  ) {}

  async execute(params: {
    userId: string;
    transactionId: string;
    classification: string;
    sourceType: string;
    sourceReference: string;
    effectiveDate: string;
  }): Promise<{ outcome: string; record: TaxTradeClassificationRow }> {
    if (!TRADE_VALUES.includes(params.classification as never)) badInput('Invalid classification');
    if (!TRADE_SOURCES.includes(params.sourceType as never)) badInput('Invalid sourceType');
    if (
      !params.sourceReference ||
      params.sourceReference.trim().length === 0 ||
      params.sourceReference.length > 255
    ) {
      badInput('sourceReference is required and must be ≤ 255 chars');
    }

    const transaction = await this.transactionRepository.findById(params.transactionId);
    if (!transaction)
      throw new NotFoundException({
        message: 'Transaction not found',
        code: 'TAX_INPUT.TRANSACTION_NOT_FOUND',
      });
    const portfolio = await this.portfolioRepository.findById(String(transaction.portfolioId));
    if (!portfolio || portfolio.userId !== params.userId) {
      throw new NotFoundException({
        message: 'Transaction not found',
        code: 'TAX_INPUT.TRANSACTION_NOT_FOUND',
      });
    }

    const effectiveDate = parseCivilDate(params.effectiveDate);
    const domain: TaxTradeClassification = {
      transactionId: params.transactionId,
      classification: params.classification as TaxTradeClassification['classification'],
      source: params.sourceType as TaxTradeClassification['source'],
      sourceReference: params.sourceReference,
      classificationVersion: 'persisted-v1',
    };
    const validation = validateTaxTradeClassification(domain);
    if (!validation.valid) badInput(validation.errors.join('; '));

    const status = params.classification === 'UNKNOWN' ? 'UNKNOWN' : 'CONFIRMED';
    const result = await this.repository.upsertTradeClassification({
      taxSubjectId: params.userId,
      transactionId: params.transactionId,
      classification: params.classification,
      sourceType: params.sourceType,
      sourceReference: params.sourceReference,
      effectiveDate,
      status,
      fingerprint: fingerprintTradeClassification({
        transactionId: params.transactionId,
        classification: params.classification,
        sourceType: params.sourceType,
        sourceReference: params.sourceReference,
        effectiveDate: params.effectiveDate,
      }),
      provenance: {
        source: params.sourceType,
        sourceReference: params.sourceReference,
        recordedAt: new Date().toISOString(),
        ...(params.sourceType === 'MANUAL_CONFIRMED'
          ? { manualConfirmedAt: new Date().toISOString() }
          : {}),
      },
    });
    return { outcome: result.outcome, record: result.record };
  }
}

@Injectable()
export class RecordWithholdingInputUseCase {
  constructor(@Inject(TAX_INPUT_REPOSITORY) private readonly repository: ITaxInputRepository) {}

  async execute(params: {
    userId: string;
    competence: string;
    economicDate: string;
    category: string;
    amount: string | null;
    currency: string;
    status: string;
    sourceType: string;
    sourceReference: string;
  }): Promise<{ outcome: string; record: TaxWithholdingRow }> {
    const competence = parseFiscalCompetence(params.competence);
    if (!competence) badInput(`Invalid competence '${params.competence}'`);
    if (!WITHHOLDING_STATUSES.includes(params.status as never)) badInput('Invalid status');
    if (!WITHHOLDING_SOURCES.includes(params.sourceType as never)) badInput('Invalid sourceType');
    if (!params.sourceReference || params.sourceReference.length > 255)
      badInput('sourceReference is required and must be ≤ 255 chars');
    if (!/^[A-Z]{3}$/.test(params.currency)) badInput('currency must be an explicit ISO-4217 code');

    let amount: Money | undefined;
    if (params.status === 'UNKNOWN') {
      if (params.amount !== null && params.amount !== undefined)
        badInput('UNKNOWN withholding must not carry an amount');
    } else {
      if (params.amount === null || params.amount === undefined) badInput('amount is required');
      try {
        amount = Money.from(params.amount, params.currency);
      } catch {
        badInput(`Invalid amount '${params.amount}'`);
      }
    }

    const economicDate = parseCivilDate(params.economicDate);
    const domain: TaxWithholdingInput = {
      id: 'pending',
      taxSubjectId: params.userId,
      sourceReference: params.sourceReference,
      sourceType: params.sourceType as TaxWithholdingInput['sourceType'],
      economicDate: LocalDate.from(params.economicDate),
      competence,
      category: params.category as TaxWithholdingInput['category'],
      currency: params.currency,
      ...(amount ? { amount } : {}),
      status: params.status as TaxWithholdingInput['status'],
      provenance: { source: params.sourceType, sourceReference: params.sourceReference },
    };
    const validation = validateTaxWithholdingInput(domain);
    if (!validation.valid) badInput(validation.errors.join('; '));

    const result = await this.repository.upsertWithholding({
      taxSubjectId: params.userId,
      competence: competence.value,
      economicDate,
      category: params.category,
      amount: amount ? amount.amount : null,
      currency: params.currency,
      status: params.status,
      sourceType: params.sourceType,
      sourceReference: params.sourceReference,
      fingerprint: fingerprintWithholding({
        competence: competence.value,
        category: params.category,
        amount: amount ? amount.amount : null,
        currency: params.currency,
        status: params.status,
        sourceType: params.sourceType,
        sourceReference: params.sourceReference,
      }),
      provenance: {
        source: params.sourceType,
        sourceReference: params.sourceReference,
        recordedAt: new Date().toISOString(),
        ...(params.sourceType === 'MANUAL' ? { manualConfirmedAt: new Date().toISOString() } : {}),
        effectiveCompetence: competence.value,
      },
    });
    return { outcome: result.outcome, record: result.record };
  }
}

@Injectable()
export class RecordFiiTaxEligibilityFactsUseCase {
  constructor(
    @Inject(TAX_INPUT_REPOSITORY) private readonly repository: ITaxInputRepository,
    @Inject(ASSET_REPOSITORY) private readonly assetRepository: IAssetRepository,
  ) {}

  async execute(params: {
    userId: string;
    assetId: string;
    asOfDate: string;
    holderCount: number | null;
    investorOwnershipPercent: string | null;
    isExchangeTraded: boolean | null;
    sourceType: string;
    sourceReference: string;
    status: string;
  }): Promise<{ outcome: string; record: FiiTaxEligibilityRow }> {
    if (!FII_STATUSES.includes(params.status as never)) badInput('Invalid status');
    if (!FII_SOURCES.includes(params.sourceType as never)) badInput('Invalid sourceType');
    if (!params.sourceReference || params.sourceReference.length > 255)
      badInput('sourceReference is required and must be ≤ 255 chars');

    const asset = await this.assetRepository.findById(params.assetId);
    if (!asset)
      throw new NotFoundException({
        message: 'Asset not found',
        code: 'TAX_INPUT.ASSET_NOT_FOUND',
      });

    const asOfDate = parseCivilDate(params.asOfDate);
    const domain: FiiTaxEligibilityFacts = {
      assetId: params.assetId,
      asOfDate: LocalDate.from(params.asOfDate),
      ...(params.holderCount !== null ? { holderCount: params.holderCount } : {}),
      ...(params.investorOwnershipPercent !== null
        ? { investorOwnershipPercent: params.investorOwnershipPercent }
        : {}),
      ...(params.isExchangeTraded !== null ? { isExchangeTraded: params.isExchangeTraded } : {}),
      source: params.sourceType as FiiTaxEligibilityFacts['source'],
      status: params.status as FiiTaxEligibilityFacts['status'],
      provenance: { source: params.sourceType, sourceReference: params.sourceReference },
    };
    const validation = validateFiiTaxEligibilityFacts(domain);
    if (!validation.valid) badInput(validation.errors.join('; '));

    const result = await this.repository.upsertFiiEligibility({
      taxSubjectId: params.userId,
      assetId: params.assetId,
      asOfDate,
      holderCount: params.holderCount,
      investorOwnershipPercent: params.investorOwnershipPercent,
      isExchangeTraded: params.isExchangeTraded,
      sourceType: params.sourceType,
      sourceReference: params.sourceReference,
      status: params.status,
      fingerprint: fingerprintFiiEligibility({
        assetId: params.assetId,
        asOfDate: params.asOfDate,
        holderCount: params.holderCount,
        investorOwnershipPercent: params.investorOwnershipPercent,
        isExchangeTraded: params.isExchangeTraded,
        status: params.status,
        sourceType: params.sourceType,
        sourceReference: params.sourceReference,
      }),
      provenance: {
        source: params.sourceType,
        sourceReference: params.sourceReference,
        recordedAt: new Date().toISOString(),
        ...(params.sourceType === 'MANUAL_CONFIRMED'
          ? { manualConfirmedAt: new Date().toISOString() }
          : {}),
      },
    });
    return { outcome: result.outcome, record: result.record };
  }
}
