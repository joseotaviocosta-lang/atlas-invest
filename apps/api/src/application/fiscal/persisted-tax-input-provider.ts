import { Inject, Injectable } from '@nestjs/common';
import { LocalDate, Money } from '@atlas/domain';
import type {
  FiiTaxEligibilityFacts,
  TaxTradeClassification,
  TaxWithholdingInput,
  TradeClassificationSource,
  TaxWithholdingSourceType,
  FiiTaxMetadataSource,
  FiiTaxEligibilityStatus,
  TaxWithholdingStatus,
} from '@atlas/tax-engine';
import { fiscalCompetenceFromString } from '@atlas/tax-engine';
import { ITaxInputRepository } from '@atlas/database';
import { TAX_INPUT_REPOSITORY } from '../../database/tokens';
import type { TaxInputProvider } from './tax-input-provider';

function toLocalDate(date: Date): LocalDate {
  // Civil date from @db.Date: use UTC components to avoid timezone drift.
  return LocalDate.fromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Prisma-backed canonical tax-input provider (Phase 4B.3). Replaces the 4B.2
 * empty placeholder with real persisted inputs. Performs no tax calculation.
 */
@Injectable()
export class PersistedTaxInputProvider implements TaxInputProvider {
  constructor(
    @Inject(TAX_INPUT_REPOSITORY)
    private readonly repository: ITaxInputRepository,
  ) {}

  async getTradeClassifications(
    taxSubjectId: string,
    _competence: string,
  ): Promise<readonly TaxTradeClassification[]> {
    const rows = await this.repository.listTradeClassifications(taxSubjectId);
    return rows.map((row) => ({
      transactionId: row.transactionId,
      // A conflicted classification is unresolved for calculation purposes.
      classification:
        row.conflictStatus === 'CONFLICT'
          ? 'UNKNOWN'
          : (row.classification as TaxTradeClassification['classification']),
      source: row.sourceType as TradeClassificationSource,
      sourceReference: row.sourceReference,
      classifiedAt: row.createdAt.toISOString(),
      classificationVersion: 'persisted-v1',
    }));
  }

  async getWithholdingInputs(
    taxSubjectId: string,
    competence: string,
  ): Promise<readonly TaxWithholdingInput[]> {
    const rows = await this.repository.listWithholdings(taxSubjectId, competence);
    return rows.map((row) => ({
      id: row.id,
      taxSubjectId: row.taxSubjectId,
      sourceReference: row.sourceReference,
      sourceType: row.sourceType as TaxWithholdingSourceType,
      economicDate: toLocalDate(row.economicDate),
      competence: fiscalCompetenceFromString(row.competence),
      category: row.category as TaxWithholdingInput['category'],
      currency: row.currency,
      ...(row.amount !== null ? { amount: Money.from(row.amount, row.currency) } : {}),
      // A conflicted withholding is not confirmed for calculation purposes.
      status: (row.conflictStatus === 'CONFLICT'
        ? 'UNVERIFIED'
        : row.status) as TaxWithholdingStatus,
      provenance: {
        source: row.sourceType,
        sourceReference: row.sourceReference,
        recordedAt: row.createdAt.toISOString(),
        ...(row.confirmedAt ? { manualConfirmedAt: row.confirmedAt.toISOString() } : {}),
        effectiveCompetence: row.competence,
      },
    }));
  }

  async getFiiEligibilityFacts(
    taxSubjectId: string,
    assetIds: readonly string[],
    asOfDate: string,
  ): Promise<readonly FiiTaxEligibilityFacts[]> {
    const rows = await this.repository.listFiiEligibility(
      taxSubjectId,
      assetIds,
      toDateOnly(asOfDate),
    );
    return rows.map((row) => ({
      assetId: row.assetId,
      asOfDate: toLocalDate(row.asOfDate),
      ...(row.holderCount !== null ? { holderCount: row.holderCount } : {}),
      ...(row.investorOwnershipPercent !== null
        ? { investorOwnershipPercent: row.investorOwnershipPercent }
        : {}),
      ...(row.isExchangeTraded !== null ? { isExchangeTraded: row.isExchangeTraded } : {}),
      source: row.sourceType as FiiTaxMetadataSource,
      // A conflicted fact is not fully known for calculation purposes.
      status: (row.conflictStatus === 'CONFLICT'
        ? 'PARTIAL'
        : row.status) as FiiTaxEligibilityStatus,
      provenance: {
        source: row.sourceType,
        sourceReference: row.sourceReference,
        recordedAt: row.createdAt.toISOString(),
      },
    }));
  }
}
