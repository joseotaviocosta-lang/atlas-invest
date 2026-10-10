import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ITaxComplianceActionRepository,
  TaxComplianceActionRow,
  TaxComplianceActionWriteOutcome,
} from '@atlas/database';
import {
  TAX_COMPLIANCE_USER_ACTION_TYPES,
  type TaxComplianceUserActionType,
} from '@atlas/tax-engine';
import { TAX_COMPLIANCE_ACTION_REPOSITORY } from '../../database/tokens';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';

export interface RecordTaxComplianceActionInput {
  readonly taxSubjectId: string;
  readonly obligationKey: string;
  readonly actionType: string;
  readonly sourceFingerprint?: string | null;
  readonly note?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface RecordTaxComplianceActionResult {
  readonly outcome: TaxComplianceActionWriteOutcome;
  readonly record: TaxComplianceActionRow;
}

@Injectable()
export class RecordTaxComplianceActionUseCase {
  constructor(
    @Inject(TAX_COMPLIANCE_ACTION_REPOSITORY)
    private readonly actionRepository: ITaxComplianceActionRepository,
    @Inject(FISCAL_CLOCK) private readonly clock: FiscalClock,
  ) {}

  async execute(input: RecordTaxComplianceActionInput): Promise<RecordTaxComplianceActionResult> {
    const { taxSubjectId, obligationKey, actionType } = input;

    // Validate obligationKey starts with the caller's taxSubjectId (anti-enumeration 404)
    if (!obligationKey || !obligationKey.startsWith(`${taxSubjectId}:`)) {
      throw new NotFoundException({
        message: `Tax compliance obligation '${obligationKey}' not found`,
        code: 'COMPLIANCE.OBLIGATION_NOT_FOUND',
      });
    }

    if (!TAX_COMPLIANCE_USER_ACTION_TYPES.includes(actionType as TaxComplianceUserActionType)) {
      throw new BadRequestException({
        message: `Invalid action type '${actionType}'. Allowed types: ${TAX_COMPLIANCE_USER_ACTION_TYPES.join(', ')}`,
        code: 'VALIDATION.INVALID_INPUT',
      });
    }

    const occurredAt = `${this.clock.today()}T00:00:00.000Z`;

    return this.actionRepository.create({
      taxSubjectId,
      obligationKey,
      actionType,
      sourceFingerprint: input.sourceFingerprint ?? null,
      note: input.note ?? null,
      metadata: input.metadata ?? null,
      occurredAt,
    });
  }
}
