import { Inject, Injectable } from '@nestjs/common';
import type { ITaxpayerIdentityRepository } from '@atlas/database';
import { TAXPAYER_IDENTITY_REPOSITORY } from '../../database/tokens';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import { GetTaxPaymentSummaryUseCase } from './get-tax-payment-summary.use-case';
import { GetTaxPaymentAdjustmentUseCase } from './get-tax-payment-adjustment.use-case';
import { evaluateDarfHandoff } from './darf-handoff-evaluator';
import { mapPlanToReadiness, type DarfReadinessReadModel } from './darf-generation.read-model';

/**
 * Phase 4F — official DARF readiness. Consumes the 4E payment summary and the 4D
 * adjustment; never generates the document and never recalculates tax (ADR-287).
 */
@Injectable()
export class GetDarfReadinessUseCase {
  constructor(
    @Inject(GetTaxPaymentSummaryUseCase)
    private readonly summary: GetTaxPaymentSummaryUseCase,
    @Inject(GetTaxPaymentAdjustmentUseCase)
    private readonly adjustment: GetTaxPaymentAdjustmentUseCase,
    @Inject(TAXPAYER_IDENTITY_REPOSITORY)
    private readonly identity: ITaxpayerIdentityRepository,
    @Inject(FISCAL_CLOCK) private readonly clock: FiscalClock,
  ) {}

  async execute(params: {
    userId: string;
    obligationId: string;
    paymentDate?: string | null;
  }): Promise<DarfReadinessReadModel> {
    const evaluation = await evaluateDarfHandoff(
      {
        summary: this.summary,
        adjustment: this.adjustment,
        identity: this.identity,
        clock: this.clock,
      },
      params,
    );
    return mapPlanToReadiness({
      obligationId: evaluation.obligationId,
      competence: evaluation.competence,
      overdue: evaluation.overdue,
      plan: evaluation.plan,
      identity: evaluation.identity,
      adjustment: evaluation.adjustment,
      currency: evaluation.currency,
    });
  }
}
