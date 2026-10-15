import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ITaxSettlementRepository,
  TaxSettlementRow,
  TaxSettlementWriteOutcome,
} from '@atlas/database';
import {
  TaxPaymentEvidenceRecord,
  computeTaxSettlementEvidenceFingerprint,
} from '@atlas/tax-engine';
import { TAX_SETTLEMENT_REPOSITORY } from '../../database/tokens';
import { GetTaxComplianceTimelineUseCase } from './get-tax-compliance-timeline.use-case';

export interface RecordTaxPaymentEvidenceInput {
  readonly taxSubjectId: string;
  readonly obligationKey: string;
  readonly paymentDate: string;
  readonly amountReported: string;
  readonly revenueCodeReported?: string | null;
  readonly referencePeriod: string;
  readonly externalReference?: string | null;
  readonly note?: string | null;
}

export function mapSettlementRowToEvidenceRecord(row: TaxSettlementRow): TaxPaymentEvidenceRecord {
  const y = row.paymentDate.getUTCFullYear();
  const m = String(row.paymentDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(row.paymentDate.getUTCDate()).padStart(2, '0');
  return {
    id: row.id,
    taxSubjectId: row.taxSubjectId,
    obligationKey: row.obligationKey,
    sourceFingerprint: row.sourceFingerprint,
    evidenceFingerprint: row.evidenceFingerprint,
    revision: row.revision,
    paymentDate: `${y}-${m}-${d}`,
    amountReported: row.amountReported,
    revenueCodeReported: row.revenueCodeReported,
    referencePeriod: row.referencePeriod,
    externalReference: row.externalReference,
    verificationStatus: 'USER_REPORTED',
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class RecordTaxPaymentEvidenceUseCase {
  constructor(
    @Inject(GetTaxComplianceTimelineUseCase)
    private readonly timelineUseCase: GetTaxComplianceTimelineUseCase,
    @Inject(TAX_SETTLEMENT_REPOSITORY)
    private readonly settlementRepository: ITaxSettlementRepository,
  ) {}

  async execute(
    input: RecordTaxPaymentEvidenceInput,
  ): Promise<{ record: TaxPaymentEvidenceRecord; outcome: TaxSettlementWriteOutcome }> {
    // 1. Anti-enumeration: obligationKey must start with authenticated taxSubjectId
    if (!input.obligationKey.startsWith(`${input.taxSubjectId}:`)) {
      throw new NotFoundException(`Tax obligation '${input.obligationKey}' was not found.`);
    }

    // 2. Validate input fields without float conversion (rule 1.1)
    if (
      !/^\d+(\.\d{1,18})?$/.test(input.amountReported) ||
      /^0(\.0+)?$/.test(input.amountReported)
    ) {
      throw new BadRequestException('Amount reported must be a positive decimal string.');
    }

    // 3. Resolve authoritative obligation to obtain current sourceFingerprint
    const parts = input.obligationKey.split(':');
    const period = parts[1] ?? '';
    const calendarYear = parseInt(period.slice(0, 4), 10);
    if (isNaN(calendarYear)) {
      throw new NotFoundException(
        `Invalid period format in obligationKey '${input.obligationKey}'.`,
      );
    }

    const timeline = await this.timelineUseCase.execute({
      taxSubjectId: input.taxSubjectId,
      calendarYear,
    });

    const obligation = timeline.obligations.find((o) => o.obligationKey === input.obligationKey);
    if (!obligation) {
      throw new NotFoundException(`Tax obligation '${input.obligationKey}' was not found.`);
    }

    // Readiness guard: evidence attests payment of a payable obligation.
    // Recording against a zero-tax month or an obligation without a projected
    // due date (e.g. provisional competence) would fabricate payable history.
    // Mirrors the payment-support derivation (positive amount + due date).
    const hasPositiveAmount =
      obligation.amount !== null &&
      obligation.amount !== '0' &&
      obligation.amount !== '0.00' &&
      !obligation.amount.startsWith('-');
    if (!hasPositiveAmount || !obligation.dueDate) {
      throw new UnprocessableEntityException({
        message:
          'Payment evidence cannot be recorded while the obligation is not payable (competence in progress or official due date unavailable).',
        code: 'TAX_PAYMENT.OBLIGATION_NOT_PAYABLE',
      });
    }

    // 4. Compute deterministic semantic evidence fingerprint
    const evidenceFingerprint = computeTaxSettlementEvidenceFingerprint({
      taxSubjectId: input.taxSubjectId,
      obligationKey: input.obligationKey,
      sourceFingerprint: obligation.sourceFingerprint,
      paymentDate: input.paymentDate,
      amountReported: input.amountReported,
      revenueCodeReported: input.revenueCodeReported ?? null,
      referencePeriod: input.referencePeriod,
      externalReference: input.externalReference ?? null,
      note: input.note ?? null,
      verificationStatus: 'USER_REPORTED',
    });

    // 5. Record evidence in append-only / revisioned repository with DB-enforced idempotency
    const result = await this.settlementRepository.create({
      taxSubjectId: input.taxSubjectId,
      obligationKey: input.obligationKey,
      sourceFingerprint: obligation.sourceFingerprint,
      evidenceFingerprint,
      paymentDate: input.paymentDate,
      amountReported: input.amountReported,
      revenueCodeReported: input.revenueCodeReported ?? null,
      referencePeriod: input.referencePeriod,
      externalReference: input.externalReference ?? null,
      note: input.note ?? null,
      verificationStatus: 'USER_REPORTED',
    });

    return {
      record: mapSettlementRowToEvidenceRecord(result.record),
      outcome: result.outcome,
    };
  }
}
