import { Inject, Injectable } from '@nestjs/common';
import { ITaxInputRepository } from '@atlas/database';
import { TAX_INPUT_REPOSITORY } from '../../database/tokens';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Read-only listing of persisted canonical tax inputs for the subject. */
@Injectable()
export class ListTaxInputsUseCase {
  constructor(@Inject(TAX_INPUT_REPOSITORY) private readonly repository: ITaxInputRepository) {}

  async listTradeClassifications(userId: string) {
    const rows = await this.repository.listTradeClassifications(userId);
    return rows.map((row) => ({
      id: row.id,
      transactionId: row.transactionId,
      classification: row.classification,
      sourceType: row.sourceType,
      sourceReference: row.sourceReference,
      effectiveDate: isoDate(row.effectiveDate),
      status: row.status,
      conflictStatus: row.conflictStatus,
      createdAt: row.createdAt.toISOString(),
      confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    }));
  }

  async listWithholdings(userId: string, competence?: string) {
    const rows = await this.repository.listWithholdings(userId, competence);
    return rows.map((row) => ({
      id: row.id,
      competence: row.competence,
      economicDate: isoDate(row.economicDate),
      category: row.category,
      withholdingCategory: row.withholdingCategory,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      sourceType: row.sourceType,
      sourceReference: row.sourceReference,
      conflictStatus: row.conflictStatus,
      createdAt: row.createdAt.toISOString(),
      confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    }));
  }

  async listFiiEligibility(userId: string, assetId: string, asOfDate: string) {
    const rows = await this.repository.listFiiEligibility(
      userId,
      [assetId],
      new Date(`${asOfDate}T00:00:00.000Z`),
    );
    return rows.map((row) => ({
      id: row.id,
      assetId: row.assetId,
      asOfDate: isoDate(row.asOfDate),
      holderCount: row.holderCount,
      investorOwnershipPercent: row.investorOwnershipPercent,
      isExchangeTraded: row.isExchangeTraded,
      sourceType: row.sourceType,
      sourceReference: row.sourceReference,
      status: row.status,
      conflictStatus: row.conflictStatus,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
