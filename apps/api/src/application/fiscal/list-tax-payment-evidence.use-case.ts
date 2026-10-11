import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ITaxSettlementRepository } from '@atlas/database';
import { TaxPaymentEvidenceRecord } from '@atlas/tax-engine';
import { TAX_SETTLEMENT_REPOSITORY } from '../../database/tokens';
import { mapSettlementRowToEvidenceRecord } from './record-tax-payment-evidence.use-case';

export interface ListTaxPaymentEvidenceInput {
  readonly taxSubjectId: string;
  readonly obligationKey: string;
}

@Injectable()
export class ListTaxPaymentEvidenceUseCase {
  constructor(
    @Inject(TAX_SETTLEMENT_REPOSITORY)
    private readonly settlementRepository: ITaxSettlementRepository,
  ) {}

  async execute(input: ListTaxPaymentEvidenceInput): Promise<readonly TaxPaymentEvidenceRecord[]> {
    // Strict anti-enumeration check
    if (!input.obligationKey.startsWith(`${input.taxSubjectId}:`)) {
      throw new NotFoundException(`Tax obligation '${input.obligationKey}' was not found.`);
    }

    const rows = await this.settlementRepository.listHistory({
      taxSubjectId: input.taxSubjectId,
      obligationKey: input.obligationKey,
    });

    return Object.freeze(rows.map(mapSettlementRowToEvidenceRecord));
  }
}
