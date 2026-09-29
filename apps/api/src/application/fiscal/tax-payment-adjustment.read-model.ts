import type { TaxPaymentAdjustment } from '@atlas/tax-engine';

/**
 * Phase 4D.2 — serializable overdue adjustment read model. Money is exact
 * decimal strings; dates are civil `YYYY-MM-DD`. No tax math on the client
 * (ADR-274).
 */
export interface AdjustmentMoneyReadModel {
  readonly amount: string;
  readonly currency: string;
}

export interface AdjustmentAuthorityReadModel {
  readonly source: string;
  readonly snapshotId: string | null;
  readonly version: number | null;
}

export interface TaxPaymentAdjustmentReadModel {
  readonly obligationId: string;
  readonly status: string;
  readonly reasonCode: string | null;
  readonly principalAmount: AdjustmentMoneyReadModel | null;
  readonly dueDate: string | null;
  readonly paymentDate: string;
  readonly lateFeeAmount: AdjustmentMoneyReadModel | null;
  readonly interestAmount: AdjustmentMoneyReadModel | null;
  readonly updatedAmount: AdjustmentMoneyReadModel | null;
  readonly lateFeePercentage: string | null;
  readonly interestPercentage: string | null;
  readonly daysLate: number;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly roundingMode: string;
  readonly authority: AdjustmentAuthorityReadModel;
  readonly interestRateSnapshotIds: readonly string[];
  readonly trace: readonly {
    readonly stage: string;
    readonly detail: string;
    readonly values?: Readonly<Record<string, string>>;
  }[];
  readonly disclaimer: string;
}

const DISCLAIMER =
  'Cálculo de acréscimos legais (multa e juros) com base em dados oficiais da ' +
  'Receita Federal (Sicalc) e nas regras do art. 61 da Lei nº 9.430/1996. O valor ' +
  'original permanece inalterado; o valor atualizado é derivado para a data de ' +
  'pagamento informada. Não gera DARF oficial nem efetua pagamento.';

export function mapAdjustmentToReadModel(
  adjustment: TaxPaymentAdjustment,
): TaxPaymentAdjustmentReadModel {
  const money = (amount: string): AdjustmentMoneyReadModel => ({
    amount,
    currency: adjustment.currency,
  });
  const blocked = adjustment.status === 'BLOCKED';
  return {
    obligationId: adjustment.obligationId,
    status: adjustment.status,
    reasonCode: adjustment.reasonCode,
    principalAmount: money(adjustment.principalAmount),
    dueDate: adjustment.dueDate,
    paymentDate: adjustment.paymentDate,
    lateFeeAmount: blocked ? null : money(adjustment.lateFeeAmount),
    interestAmount: blocked ? null : money(adjustment.interestAmount),
    updatedAmount: blocked ? null : money(adjustment.updatedAmount),
    lateFeePercentage: adjustment.lateFeePercentage,
    interestPercentage: adjustment.interestPercentage,
    daysLate: adjustment.daysLate,
    ruleId: adjustment.ruleId,
    ruleVersion: adjustment.ruleVersion,
    roundingMode: adjustment.roundingMode,
    authority: {
      source: adjustment.lateFeeAuthorityId ? 'SICALC' : 'UNAVAILABLE',
      snapshotId: adjustment.lateFeeAuthorityId,
      version: null,
    },
    interestRateSnapshotIds: adjustment.interestRateSnapshotIds,
    trace: adjustment.trace,
    disclaimer: DISCLAIMER,
  };
}

export function blockedAdjustmentReadModel(input: {
  obligationId: string;
  paymentDate: string;
  principalAmount: string | null;
  currency: string | null;
  dueDate: string | null;
  reasonCode: string;
}): TaxPaymentAdjustmentReadModel {
  const currency = input.currency ?? 'BRL';
  const money = (amount: string | null): AdjustmentMoneyReadModel | null =>
    amount === null ? null : { amount, currency };
  return {
    obligationId: input.obligationId,
    status: 'BLOCKED',
    reasonCode: input.reasonCode,
    principalAmount: money(input.principalAmount),
    dueDate: input.dueDate,
    paymentDate: input.paymentDate,
    lateFeeAmount: null,
    interestAmount: null,
    updatedAmount: null,
    lateFeePercentage: null,
    interestPercentage: null,
    daysLate: 0,
    ruleId: 'BR-FEDERAL-LATE-PAYMENT-ART61',
    ruleVersion: '1.0.0',
    roundingMode: 'ROUND_HALF_EVEN',
    authority: { source: 'UNAVAILABLE', snapshotId: null, version: null },
    interestRateSnapshotIds: [],
    trace: [],
    disclaimer: DISCLAIMER,
  };
}
