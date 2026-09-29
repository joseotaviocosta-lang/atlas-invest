import { Inject, Injectable } from '@nestjs/common';
import type {
  IOfficialDarfGenerationRepository,
  ITaxpayerIdentityRepository,
} from '@atlas/database';
import {
  OFFICIAL_DARF_GENERATION_REPOSITORY,
  TAXPAYER_IDENTITY_REPOSITORY,
} from '../../database/tokens';
import { hashDarfHandoffFingerprint } from './darf-generation-fingerprint';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { GetTaxPaymentSummaryUseCase } from './get-tax-payment-summary.use-case';
import { GetTaxPaymentAdjustmentUseCase } from './get-tax-payment-adjustment.use-case';
import { evaluateDarfHandoff } from './darf-handoff-evaluator';
import {
  mapDarfRecordToReadModel,
  mapPlanToReadiness,
  type DarfHandoffResultReadModel,
} from './darf-generation.read-model';

/**
 * Phase 4F — materializes the official DARF interactive-handoff record. Idempotent
 * per preparation fingerprint; a changed preparation supersedes the previous
 * record. Atlas does NOT generate the official document (ADR-285, ADR-288).
 */
@Injectable()
export class CreateDarfHandoffUseCase {
  constructor(
    @Inject(GetTaxPaymentSummaryUseCase)
    private readonly summary: GetTaxPaymentSummaryUseCase,
    @Inject(GetTaxPaymentAdjustmentUseCase)
    private readonly adjustment: GetTaxPaymentAdjustmentUseCase,
    @Inject(TAXPAYER_IDENTITY_REPOSITORY)
    private readonly identity: ITaxpayerIdentityRepository,
    @Inject(OFFICIAL_DARF_GENERATION_REPOSITORY)
    private readonly generationRepository: IOfficialDarfGenerationRepository,
    @Inject(FISCAL_CLOCK) private readonly clock: FiscalClock,
  ) {}

  async execute(params: {
    userId: string;
    obligationId: string;
    paymentDate?: string | null;
  }): Promise<DarfHandoffResultReadModel> {
    const evaluation = await evaluateDarfHandoff(
      {
        summary: this.summary,
        adjustment: this.adjustment,
        identity: this.identity,
        clock: this.clock,
      },
      params,
    );
    const readiness = mapPlanToReadiness({
      obligationId: evaluation.obligationId,
      competence: evaluation.competence,
      overdue: evaluation.overdue,
      plan: evaluation.plan,
      identity: evaluation.identity,
      adjustment: evaluation.adjustment,
      currency: evaluation.currency,
    });

    const prepared = evaluation.plan.preparedValues;
    if (evaluation.plan.status !== 'USER_ACTION_REQUIRED' || !prepared) {
      return { readiness, record: null };
    }

    const { record } = await this.generationRepository.materialize({
      taxSubjectId: params.userId,
      taxObligationId: evaluation.obligationId,
      taxPaymentAggregationId: evaluation.aggregationId,
      generationMode: evaluation.plan.generationMode,
      revenueCode: prepared.revenueCode,
      competence: prepared.competence,
      dueDate: prepared.dueDate ? new Date(`${prepared.dueDate}T00:00:00.000Z`) : null,
      principalAmount: prepared.principalAmount,
      lateFeeAmount: prepared.lateFeeAmount,
      interestAmount: prepared.interestAmount,
      totalAmount: prepared.totalAmount,
      currency: prepared.currency,
      sourceSystem: evaluation.plan.destination?.sourceSystem ?? 'RFB_SICALC',
      status: 'USER_ACTION_REQUIRED',
      fingerprint: hashDarfHandoffFingerprint(evaluation.plan.fingerprint),
    });

    return {
      readiness,
      record: mapDarfRecordToReadModel(record, prepared.carryForwardAmount),
    };
  }
}
