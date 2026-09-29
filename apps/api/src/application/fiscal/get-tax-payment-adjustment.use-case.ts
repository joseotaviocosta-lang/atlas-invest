import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import {
  IOfficialLateFeeRepository,
  ITaxInterestRateRepository,
  ITaxObligationRepository,
} from '@atlas/database';
import {
  buildTaxPaymentAdjustment,
  isCivilDate,
  monthsBetween,
  type OfficialInterestRate,
  type OfficialLateFeeAuthority,
} from '@atlas/tax-engine';
import {
  OFFICIAL_LATE_FEE_REPOSITORY,
  TAX_INTEREST_RATE_REPOSITORY,
  TAX_OBLIGATION_REPOSITORY,
} from '../../database/tokens';
import { BR_FEDERAL_LATE_PAYMENT_RULE } from './federal-late-payment-registry';
import {
  blockedAdjustmentReadModel,
  mapAdjustmentToReadModel,
  type TaxPaymentAdjustmentReadModel,
} from './tax-payment-adjustment.read-model';

/**
 * Municipality used to resolve the official Sicalc late-fee authority. Local
 * holidays depend on it; until a canonical taxpayer-municipality source exists,
 * a default is used and missing snapshots fail closed (ADR-275).
 */
export const DEFAULT_LATE_FEE_MUNICIPALITY_CODE = '7107';

const SELIC_INDEX = 'SELIC';
const PAYABLE_STATUSES = new Set(['OPEN', 'PAID']);

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Phase 4D.2 — non-mutating overdue adjustment preview. Consumes the persisted
 * official late-fee authority and official SELIC snapshots; fails closed when
 * authority or rates are missing (ADR-270/271/272).
 */
@Injectable()
export class GetTaxPaymentAdjustmentUseCase {
  constructor(
    @Inject(TAX_OBLIGATION_REPOSITORY)
    private readonly obligationRepository: ITaxObligationRepository,
    @Inject(OFFICIAL_LATE_FEE_REPOSITORY)
    private readonly lateFeeRepository: IOfficialLateFeeRepository,
    @Inject(TAX_INTEREST_RATE_REPOSITORY)
    private readonly interestRateRepository: ITaxInterestRateRepository,
  ) {}

  async execute(params: {
    userId: string;
    obligationId: string;
    paymentDate: string;
  }): Promise<TaxPaymentAdjustmentReadModel> {
    if (!isCivilDate(params.paymentDate)) {
      throw new BadRequestException({
        message: `Invalid paymentDate '${params.paymentDate}'. Expected canonical 'YYYY-MM-DD'`,
        code: 'TAX_ADJUSTMENT.INVALID_PAYMENT_DATE',
      });
    }
    const obligation = await this.obligationRepository.findById(params.obligationId, params.userId);
    if (!obligation) {
      throw new NotFoundException({
        message: `Tax obligation '${params.obligationId}' not found`,
        code: 'TAX_OBLIGATION.NOT_FOUND',
      });
    }
    const dueDate = isoDate(obligation.dueDate);
    if (!obligation.principalAmount || !dueDate || !obligation.currency) {
      return blockedAdjustmentReadModel({
        obligationId: obligation.id,
        paymentDate: params.paymentDate,
        principalAmount: obligation.principalAmount,
        currency: obligation.currency,
        dueDate,
        reasonCode: 'OBLIGATION_NOT_PAYABLE',
      });
    }
    if (
      !PAYABLE_STATUSES.has(obligation.status) &&
      obligation.status !== 'RECONCILIATION_REQUIRED'
    ) {
      return blockedAdjustmentReadModel({
        obligationId: obligation.id,
        paymentDate: params.paymentDate,
        principalAmount: obligation.principalAmount,
        currency: obligation.currency,
        dueDate,
        reasonCode: 'OBLIGATION_NOT_PAYABLE',
      });
    }

    // Official late-fee authority (business-day-sensitive) from Sicalc snapshot.
    const lateFeeRow = await this.lateFeeRepository.findLatest({
      municipalityCode: DEFAULT_LATE_FEE_MUNICIPALITY_CODE,
      dueDate: toDate(dueDate),
      paymentDate: toDate(params.paymentDate),
      principalAmount: obligation.principalAmount,
    });
    const lateFeeAuthority: OfficialLateFeeAuthority | null = lateFeeRow
      ? {
          snapshotId: lateFeeRow.id,
          version: lateFeeRow.version,
          startBusinessDate: isoDate(lateFeeRow.startBusinessDate),
          amount: lateFeeRow.lateFeeAmount,
          percentage: lateFeeRow.lateFeePercent,
        }
      : null;

    // Required SELIC months (strictly between due and payment months).
    const months =
      dueDate.slice(0, 7) === params.paymentDate.slice(0, 7)
        ? []
        : monthsBetween(dueDate.slice(0, 7), params.paymentDate.slice(0, 7));
    const rateRows = await this.interestRateRepository.listByIndexAndMonths(SELIC_INDEX, months);
    const interestRates: OfficialInterestRate[] = rateRows.map((row) => ({
      snapshotId: row.id,
      version: row.version,
      referenceMonth: row.referenceMonth,
      ratePercent: row.ratePercent,
    }));

    const adjustment = buildTaxPaymentAdjustment({
      obligationId: obligation.id,
      obligationFingerprint: obligation.liabilityFingerprint,
      principalAmount: obligation.principalAmount,
      currency: obligation.currency,
      dueDate,
      paymentDate: params.paymentDate,
      rule: BR_FEDERAL_LATE_PAYMENT_RULE,
      lateFeeAuthority,
      interestRates,
    });
    return mapAdjustmentToReadModel(adjustment);
  }
}
