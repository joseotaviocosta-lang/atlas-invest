import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ITaxObligationRepository, ITaxPaymentEvidenceRepository } from '@atlas/database';
import { validateTaxPaymentEvidence } from '@atlas/tax-engine';
import { TAX_OBLIGATION_REPOSITORY, TAX_PAYMENT_EVIDENCE_REPOSITORY } from '../../database/tokens';
import { fingerprintPaymentEvidence } from './tax-obligation-fingerprint';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { GetTaxPaymentAdjustmentUseCase } from './get-tax-payment-adjustment.use-case';
import { mapObligationToReadModel, type TaxObligationReadModel } from './tax-obligation.read-model';

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Phase 4C.2 — records MANUAL_CONFIRMED payment evidence for an obligation.
 * Exact decimals only; full payment required (no partial/overpayment semantics).
 * Payment never mutates the tax liability (ADR-266).
 */
@Injectable()
export class RecordTaxPaymentUseCase {
  constructor(
    @Inject(TAX_OBLIGATION_REPOSITORY)
    private readonly obligationRepository: ITaxObligationRepository,
    @Inject(TAX_PAYMENT_EVIDENCE_REPOSITORY)
    private readonly paymentRepository: ITaxPaymentEvidenceRepository,
    @Inject(FISCAL_CLOCK) private readonly clock: FiscalClock,
    @Inject(GetTaxPaymentAdjustmentUseCase)
    private readonly adjustmentUseCase: GetTaxPaymentAdjustmentUseCase,
  ) {}

  async execute(params: {
    userId: string;
    obligationId: string;
    paidAt: string;
    amount: string;
    currency: string;
    sourceType: string;
    sourceReference?: string | null;
  }): Promise<TaxObligationReadModel> {
    const row = await this.obligationRepository.findById(params.obligationId, params.userId);
    if (!row) {
      throw new NotFoundException({
        message: `Tax obligation '${params.obligationId}' not found`,
        code: 'TAX_OBLIGATION.NOT_FOUND',
      });
    }
    if (row.status !== 'OPEN' && row.status !== 'PAID') {
      throw new BadRequestException({
        message: `Tax obligation '${row.id}' is not payable (status ${row.status}).`,
        code: 'TAX_PAYMENT.OBLIGATION_NOT_PAYABLE',
      });
    }

    const now = this.clock.today();
    const sourceReference = params.sourceReference ?? null;

    // For an overdue obligation the accepted amount must match the verified
    // updated payable amount (principal + late fee + interest), never the bare
    // principal (ADR-276).
    const dueDate = isoDate(row.dueDate);
    let expectedAmount = row.principalAmount;
    if (dueDate && params.paidAt > dueDate) {
      const adjustment = await this.adjustmentUseCase.execute({
        userId: params.userId,
        obligationId: row.id,
        paymentDate: params.paidAt,
      });
      if (adjustment.status !== 'READY' || !adjustment.updatedAmount) {
        throw new BadRequestException({
          message: `Overdue amount for obligation '${row.id}' could not be verified.`,
          code: 'TAX_PAYMENT.ADJUSTMENT_UNAVAILABLE',
        });
      }
      expectedAmount = adjustment.updatedAmount.amount;
    }

    const validation = validateTaxPaymentEvidence(
      {
        paidAt: params.paidAt,
        amount: params.amount,
        currency: params.currency,
        sourceType: params.sourceType,
        ...(sourceReference ? { sourceReference } : {}),
        confirmedAt: now,
      },
      {
        principalAmount: expectedAmount,
        currency: row.currency,
        dueDate,
      },
      now,
    );
    if (!validation.valid) {
      throw new BadRequestException({
        message: `Invalid tax payment evidence (${validation.code}).`,
        code: validation.code,
      });
    }

    const fingerprint = fingerprintPaymentEvidence({
      obligationId: row.id,
      paidAt: params.paidAt,
      amount: params.amount,
      currency: params.currency,
      sourceType: params.sourceType,
      sourceReference,
    });

    const result = await this.paymentRepository.record({
      obligationId: row.id,
      taxSubjectId: params.userId,
      paidAt: new Date(`${params.paidAt}T00:00:00.000Z`),
      amount: params.amount,
      currency: params.currency,
      sourceType: params.sourceType,
      sourceReference,
      confirmedAt: new Date(`${now}T00:00:00.000Z`),
      status: 'CONFIRMED',
      fingerprint,
    });
    if (result.outcome === 'CONFLICT') {
      throw new ConflictException({
        message: 'Payment evidence already exists for this source identity with a different value.',
        code: 'TAX_PAYMENT.CONFLICT',
      });
    }

    const updated =
      row.status === 'PAID'
        ? row
        : ((await this.obligationRepository.markPaid(row.id, params.userId)) ?? row);
    const payments = await this.paymentRepository.listByObligation(row.id, params.userId);
    return mapObligationToReadModel(updated, now, payments);
  }
}
