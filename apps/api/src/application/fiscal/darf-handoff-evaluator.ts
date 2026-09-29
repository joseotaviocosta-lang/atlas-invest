import { NotFoundException } from '@nestjs/common';
import {
  buildDarfHandoffPlan,
  type DarfAdjustmentSnapshot,
  type DarfHandoffPlan,
} from '@atlas/tax-engine';
import type { ITaxpayerIdentityRepository } from '@atlas/database';
import {
  OFFICIAL_DARF_DESTINATION,
  PRODUCTION_DARF_SUPPORTED_REVENUE_CODES,
} from './official-darf-registry';
import type { FiscalClock } from './fiscal-clock';
import type { GetTaxPaymentSummaryUseCase } from './get-tax-payment-summary.use-case';
import type { GetTaxPaymentAdjustmentUseCase } from './get-tax-payment-adjustment.use-case';
import {
  mapIdentityToReadModel,
  type DarfAdjustmentReadModel,
  type TaxpayerIdentityReadModel,
} from './darf-generation.read-model';

export interface DarfHandoffEvaluation {
  readonly plan: DarfHandoffPlan;
  readonly obligationId: string;
  readonly competence: string;
  readonly overdue: boolean;
  readonly identity: TaxpayerIdentityReadModel;
  readonly adjustment: DarfAdjustmentReadModel | null;
  readonly aggregationId: string | null;
  readonly currency: string;
}

/**
 * Shared evaluator for DARF readiness and handoff. Consumes the authoritative
 * 4E payment summary (eligibility / DarfPreparationV2) and the 4D adjustment; it
 * never recalculates tax (ADR-287).
 */
export async function evaluateDarfHandoff(
  deps: {
    readonly summary: GetTaxPaymentSummaryUseCase;
    readonly adjustment: GetTaxPaymentAdjustmentUseCase;
    readonly identity: ITaxpayerIdentityRepository;
    readonly clock: FiscalClock;
  },
  params: {
    readonly userId: string;
    readonly obligationId: string;
    readonly paymentDate?: string | null;
  },
): Promise<DarfHandoffEvaluation> {
  const summary = await deps.summary.forObligation({
    userId: params.userId,
    obligationId: params.obligationId,
  });
  const obligation = summary.obligation;
  if (!obligation) {
    throw new NotFoundException({
      message: `Tax obligation '${params.obligationId}' not found`,
      code: 'TAX_OBLIGATION.NOT_FOUND',
    });
  }
  const eligibility = summary.eligibility;
  const dueDate = eligibility.dueDate;
  const now = deps.clock.today();
  const overdue = dueDate !== null && now > dueDate;
  const paymentDate = params.paymentDate ?? now;

  let adjustmentReadModel: DarfAdjustmentReadModel | null = null;
  let adjustmentSnapshot: DarfAdjustmentSnapshot | null = null;
  if (overdue) {
    const adj = await deps.adjustment.execute({
      userId: params.userId,
      obligationId: obligation.id,
      paymentDate,
    });
    adjustmentReadModel = {
      status: adj.status,
      reasonCode: adj.reasonCode,
      lateFeeAmount: adj.lateFeeAmount,
      interestAmount: adj.interestAmount,
      updatedAmount: adj.updatedAmount,
      paymentDate: adj.paymentDate,
    };
    adjustmentSnapshot =
      adj.status === 'BLOCKED'
        ? { status: 'BLOCKED', reasonCode: adj.reasonCode }
        : {
            status: adj.status as 'NOT_LATE' | 'READY',
            updatedAmount: adj.updatedAmount?.amount ?? '',
            lateFee: adj.lateFeeAmount?.amount ?? '0',
            interest: adj.interestAmount?.amount ?? '0',
          };
  }

  const identityRow = await deps.identity.findByUserId(params.userId);
  const identity = mapIdentityToReadModel(identityRow);
  const currency = eligibility.currency ?? obligation.currency ?? 'BRL';

  const plan = buildDarfHandoffPlan({
    revenueCode: obligation.revenueCode,
    competence: eligibility.targetCompetence,
    currency,
    eligibilityStatus: eligibility.status,
    totalPayable: eligibility.totalPayable?.amount ?? null,
    minimumThreshold: eligibility.minimumThreshold?.amount ?? null,
    currentPrincipal: eligibility.currentAmount?.amount ?? null,
    carryForwardAmount: eligibility.carryForwardAmount?.amount ?? null,
    dueDate,
    overdue,
    adjustment: adjustmentSnapshot,
    identityAvailable: identity.identityAvailable,
    destination: OFFICIAL_DARF_DESTINATION,
    supportedRevenueCodes: PRODUCTION_DARF_SUPPORTED_REVENUE_CODES,
    paymentDate: overdue ? paymentDate : null,
  });

  return {
    plan,
    obligationId: obligation.id,
    competence: obligation.competence,
    overdue,
    identity,
    adjustment: adjustmentReadModel,
    aggregationId: summary.aggregation?.id ?? null,
    currency,
  };
}
