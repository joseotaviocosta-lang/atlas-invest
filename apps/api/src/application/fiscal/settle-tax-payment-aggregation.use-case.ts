import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Money } from '@atlas/domain';
import {
  ITaxCarryForwardRepository,
  ITaxObligationRepository,
  ITaxPaymentAggregationRepository,
  ITaxPaymentEvidenceRepository,
} from '@atlas/database';
import { isCivilDate } from '@atlas/tax-engine';
import {
  TAX_CARRY_FORWARD_REPOSITORY,
  TAX_OBLIGATION_REPOSITORY,
  TAX_PAYMENT_AGGREGATION_REPOSITORY,
  TAX_PAYMENT_EVIDENCE_REPOSITORY,
} from '../../database/tokens';
import { fingerprintPaymentEvidence } from './tax-obligation-fingerprint';
import { FISCAL_CLOCK } from './tokens';
import type { FiscalClock } from './fiscal-clock';
import {
  mapAggregationRowToReadModel,
  type TaxPaymentAggregationReadModel,
  type TaxMoneyReadModel,
} from './tax-payment-summary.read-model';

const DISCLAIMER =
  'Baixa de pagamento de valor acumulado (DARF mínimo). Registra evidência manual ' +
  'de pagamento integral e consome exatamente uma vez as parcelas acumuladas. ' +
  'Não gera DARF oficial nem efetua pagamento bancário.';

export interface TaxPaymentSettlementReadModel {
  readonly aggregation: TaxPaymentAggregationReadModel;
  readonly settlementStatus: 'SETTLED' | 'ALREADY_SETTLED';
  readonly consumedEntryIds: readonly string[];
  readonly paidAmount: TaxMoneyReadModel;
  readonly paidAt: string;
  readonly currentObligationId: string | null;
  readonly disclaimer: string;
}

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Phase 4E — settles an aggregated payable amount. Exact full payment only;
 * partial/overpayment unsupported. Consumes the source carry-forward entries
 * exactly once and marks the current obligation PAID. Never mutates the tax
 * liability (ADR-279/281).
 */
@Injectable()
export class SettleTaxPaymentAggregationUseCase {
  constructor(
    @Inject(TAX_PAYMENT_AGGREGATION_REPOSITORY)
    private readonly aggregationRepository: ITaxPaymentAggregationRepository,
    @Inject(TAX_CARRY_FORWARD_REPOSITORY)
    private readonly carryForwardRepository: ITaxCarryForwardRepository,
    @Inject(TAX_OBLIGATION_REPOSITORY)
    private readonly obligationRepository: ITaxObligationRepository,
    @Inject(TAX_PAYMENT_EVIDENCE_REPOSITORY)
    private readonly paymentRepository: ITaxPaymentEvidenceRepository,
    @Inject(FISCAL_CLOCK) private readonly clock: FiscalClock,
  ) {}

  async execute(params: {
    userId: string;
    aggregationId: string;
    paidAt: string;
    amount: string;
    currency: string;
    sourceType: string;
    sourceReference?: string | null;
  }): Promise<TaxPaymentSettlementReadModel> {
    const aggregation = await this.aggregationRepository.findById(
      params.aggregationId,
      params.userId,
    );
    if (!aggregation) {
      throw new NotFoundException({
        message: `Tax payment aggregation '${params.aggregationId}' not found`,
        code: 'TAX_PAYMENT_AGGREGATION.NOT_FOUND',
      });
    }
    if (aggregation.status !== 'PAYABLE') {
      throw new BadRequestException({
        message: `Aggregation '${aggregation.id}' is not payable (status ${aggregation.status}).`,
        code: 'TAX_PAYMENT_AGGREGATION.NOT_PAYABLE',
      });
    }
    if (params.sourceType !== 'MANUAL_CONFIRMED') {
      throw new BadRequestException({
        message: 'Only MANUAL_CONFIRMED payment evidence is supported.',
        code: 'PAYMENT.UNSUPPORTED_SOURCE',
      });
    }
    if (aggregation.currentObligationId === null) {
      throw new BadRequestException({
        message: 'Aggregated payment without a current obligation is not supported in Phase 4E.',
        code: 'TAX_PAYMENT_AGGREGATION.WITHOUT_CURRENT_OBLIGATION',
      });
    }
    const obligation = await this.obligationRepository.findById(
      aggregation.currentObligationId,
      params.userId,
    );
    if (!obligation) {
      throw new NotFoundException({
        message: `Tax obligation '${aggregation.currentObligationId}' not found`,
        code: 'TAX_OBLIGATION.NOT_FOUND',
      });
    }

    const now = this.clock.today();
    if (!isCivilDate(params.paidAt)) {
      throw new BadRequestException({
        message: `Invalid paidAt '${params.paidAt}'. Expected canonical 'YYYY-MM-DD'`,
        code: 'PAYMENT.INVALID_DATE',
      });
    }
    if (params.paidAt > now) {
      throw new BadRequestException({
        message: 'paidAt is in the future.',
        code: 'PAYMENT.FUTURE_DATE',
      });
    }
    if (params.currency !== aggregation.currency) {
      throw new BadRequestException({
        message: 'Payment currency does not match the aggregation currency.',
        code: 'PAYMENT.CURRENCY_MISMATCH',
      });
    }

    // The aggregate is due on the deadline of the last (target) competence
    // mandated by law. Late adjustment on the aggregated amount requires an
    // official snapshot keyed to that amount; absent one, fail closed (ADR-278).
    const dueDate = isoDate(aggregation.dueDate);
    if (dueDate && params.paidAt > dueDate) {
      throw new BadRequestException({
        message:
          'Late payment of an aggregated amount requires verified official late-charge authority, which is not available in Phase 4E.',
        code: 'TAX_PAYMENT_AGGREGATION.LATE_ADJUSTMENT_UNAVAILABLE',
      });
    }

    const expected = Money.from(aggregation.totalPayable, aggregation.currency);
    const paid = Money.from(params.amount, aggregation.currency);
    if (paid.compare(expected) !== 0) {
      throw new BadRequestException({
        message: 'Payment amount must equal the aggregated total payable exactly.',
        code: 'PAYMENT.AMOUNT_MISMATCH',
      });
    }

    const sourceReference = params.sourceReference ?? null;
    const fingerprint = fingerprintPaymentEvidence({
      obligationId: obligation.id,
      paidAt: params.paidAt,
      amount: params.amount,
      currency: params.currency,
      sourceType: params.sourceType,
      sourceReference,
    });

    const paymentResult = await this.paymentRepository.record({
      obligationId: obligation.id,
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
    if (paymentResult.outcome === 'CONFLICT') {
      throw new ConflictException({
        message: 'Payment evidence already exists for this source identity with a different value.',
        code: 'TAX_PAYMENT.CONFLICT',
      });
    }

    // Exactly-once consumption of the source carry-forward entries.
    const consumption = await this.carryForwardRepository.consumeEntries({
      taxSubjectId: params.userId,
      entryIds: aggregation.sourceEntryIds,
      aggregationId: aggregation.id,
      consumedAt: new Date(`${now}T00:00:00.000Z`),
    });
    if (consumption.outcome === 'ALREADY_CONSUMED') {
      const entries = await Promise.all(
        aggregation.sourceEntryIds.map((id) =>
          this.carryForwardRepository.findById(id, params.userId),
        ),
      );
      const allConsumedByThis = entries.every(
        (entry) => entry?.consumedByAggregationId === aggregation.id,
      );
      if (!allConsumedByThis) {
        throw new ConflictException({
          message:
            'One or more carry-forward entries were already consumed by another aggregation.',
          code: 'TAX_CARRY_FORWARD.ALREADY_CONSUMED',
        });
      }
    }

    const settled =
      obligation.status === 'PAID'
        ? obligation
        : ((await this.obligationRepository.markPaid(obligation.id, params.userId)) ?? obligation);
    void settled;

    return {
      aggregation: mapAggregationRowToReadModel(aggregation),
      settlementStatus: paymentResult.outcome === 'CREATED' ? 'SETTLED' : 'ALREADY_SETTLED',
      consumedEntryIds: aggregation.sourceEntryIds,
      paidAmount: { amount: params.amount, currency: params.currency },
      paidAt: params.paidAt,
      currentObligationId: obligation.id,
      disclaimer: DISCLAIMER,
    };
  }
}
