import { Inject, Injectable } from '@nestjs/common';
import { TAXPAYER_CONFIRMATION_REPOSITORY } from '../../database/tokens';
import { ITaxpayerConfirmationRepository, TaxpayerConfirmationWriteOutcome } from '@atlas/database';
import {
  mapTaxpayerConfirmationRowToReadModel,
  TaxpayerConfirmationReadModel,
} from './annual-tax-readiness.read-model';

export interface RecordTaxpayerConfirmationInput {
  readonly taxSubjectId: string;
  readonly calendarYear: number;
  readonly confirmationType: string;
  readonly subjectReference: string;
  readonly decision: string;
  readonly statementVersion: string;
  readonly sourceFingerprint: string;
  readonly source: string;
  readonly createdByPrincipal: string;
  readonly notes?: string | null;
}

export interface RecordTaxpayerConfirmationResult {
  readonly outcome: TaxpayerConfirmationWriteOutcome;
  readonly confirmation: TaxpayerConfirmationReadModel;
}

@Injectable()
export class RecordTaxpayerConfirmationUseCase {
  constructor(
    @Inject(TAXPAYER_CONFIRMATION_REPOSITORY)
    private readonly confirmationRepo: ITaxpayerConfirmationRepository,
  ) {}

  async execute(input: RecordTaxpayerConfirmationInput): Promise<RecordTaxpayerConfirmationResult> {
    const { outcome, record } = await this.confirmationRepo.create({
      taxSubjectId: input.taxSubjectId,
      calendarYear: input.calendarYear,
      confirmationType: input.confirmationType,
      subjectReference: input.subjectReference,
      decision: input.decision,
      statementVersion: input.statementVersion,
      sourceFingerprint: input.sourceFingerprint,
      source: input.source,
      createdByPrincipal: input.createdByPrincipal,
      notes: input.notes ?? null,
    });

    return {
      outcome,
      confirmation: mapTaxpayerConfirmationRowToReadModel(record),
    };
  }
}
